import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { PhantomProcess } from '../entities/phantom-process.entity';
import { PhantomFamily } from '../entities/phantom-family.entity';
import { PhantomProcessColumn } from '../entities/phantom-process-column.entity';
import { PhantomItem } from '../entities/phantom-item.entity';
import {
  ProcessColumnDef,
  defaultProcessColumns,
  sameName,
  validateProcessColumns,
} from '../utils/process-columns';
import { REFERENCE_SEPARATORS } from '../utils/derived-fields';

/** A process with its columns in order and its families, as the API returns it */
export interface ProcessView {
  id: number;
  name: string;
  position: number;
  /** What goes between the phantom root and the kVA in the reference */
  referenceSeparator: string;
  columns: ProcessColumnDef[];
  families: { id: number; name: string; phantomItemsCount: number }[];
  phantomItemsCount: number;
}

const validationError = (field: string, messages: string[]) =>
  new BadRequestException({
    message: 'Validation failed',
    errors: { [field]: messages },
  });

/**
 * Plant processes, their families and their columns.
 *
 * Names compare without case, accents or extra whitespace: «Metalmecánica»
 * and «METALMECANICA» are the same process, which is how the workbook's
 * sheet names are matched on import.
 */
@Injectable()
export class PhantomProcessService {
  constructor(
    @InjectRepository(PhantomProcess)
    private readonly processRepository: Repository<PhantomProcess>,
    @InjectRepository(PhantomFamily)
    private readonly familyRepository: Repository<PhantomFamily>,
    @InjectRepository(PhantomProcessColumn)
    private readonly columnRepository: Repository<PhantomProcessColumn>,
    private readonly dataSource: DataSource,
  ) {}

  async list(): Promise<ProcessView[]> {
    const processes = await this.processRepository.find({
      where: { deletedAt: IsNull() },
      order: { position: 'ASC', id: 'ASC' },
    });
    if (processes.length === 0) return [];

    const [columns, families, counts] = await Promise.all([
      this.columnRepository.find({
        order: { processId: 'ASC', position: 'ASC' },
      }),
      this.familyRepository.find({
        where: { deletedAt: IsNull() },
        order: { name: 'ASC' },
      }),
      this.dataSource
        .getRepository(PhantomItem)
        .createQueryBuilder('item')
        .select('item.process_id', 'processId')
        .addSelect('item.family_id', 'familyId')
        .addSelect('COUNT(*)', 'count')
        .where('item.deleted_at IS NULL')
        .groupBy('item.process_id')
        .addGroupBy('item.family_id')
        .getRawMany<{
          processId: number;
          familyId: number | null;
          count: number;
        }>(),
    ]);

    return processes.map((process) => ({
      id: process.id,
      name: process.name,
      position: process.position,
      referenceSeparator: process.referenceSeparator ?? '',
      columns: columns
        .filter((column) => column.processId === process.id)
        .map(({ key, header, scope }) => ({ key, header, scope })),
      families: families
        .filter((family) => family.processId === process.id)
        .map((family) => ({
          id: family.id,
          name: family.name,
          phantomItemsCount: Number(
            counts.find((count) => count.familyId === family.id)?.count ?? 0,
          ),
        })),
      phantomItemsCount: counts
        .filter((count) => count.processId === process.id)
        .reduce((total, count) => total + Number(count.count), 0),
    }));
  }

  async findOrFail(id: number): Promise<ProcessView> {
    const process = (await this.list()).find((item) => item.id === id);
    if (!process)
      throw new NotFoundException(`Phantom process ${id} does not exist`);
    return process;
  }

  /** The active process with this name, compared loosely, if any */
  async findByName(name: string): Promise<ProcessView | undefined> {
    return (await this.list()).find((process) => sameName(process.name, name));
  }

  /**
   * Creates a process at the end. Without columns it takes the catalog, as
   * the «General» process does; the importer passes the ones it inferred.
   */
  async create(
    name: string,
    columns: ProcessColumnDef[] = defaultProcessColumns(),
    { referenceSeparator = '' }: { referenceSeparator?: string } = {},
  ): Promise<ProcessView> {
    const trimmed = name?.trim() ?? '';
    if (trimmed === '')
      throw validationError('name', ['The process needs a name.']);
    await this.assertNameAvailable(trimmed);
    const problems = validateProcessColumns(columns);
    if (problems.length > 0) throw validationError('columns', problems);

    const run = async (transaction: EntityManager) => {
      const last = await transaction
        .getRepository(PhantomProcess)
        .createQueryBuilder('process')
        .select('MAX(process.position)', 'max')
        .where('process.deleted_at IS NULL')
        .getRawOne<{ max: number | null }>();
      const saved = await transaction.getRepository(PhantomProcess).save({
        name: trimmed,
        position: (last?.max ?? -1) + 1,
        referenceSeparator,
      });
      await this.writeColumns(transaction, saved.id, columns);
      return saved.id;
    };

    const id = await this.dataSource.transaction(run);
    return this.findOrFail(id);
  }

  async rename(id: number, name: string): Promise<ProcessView> {
    await this.findOrFail(id);
    const trimmed = name?.trim() ?? '';
    if (trimmed === '')
      throw validationError('name', ['The process needs a name.']);
    await this.assertNameAvailable(trimmed, id);
    await this.processRepository.update(id, { name: trimmed });
    return this.findOrFail(id);
  }

  /**
   * Changes the process's reference rule. Applies from the next save or import
   * of each phantom item: stored references are not rewritten behind anyone's
   * back.
   */
  async setReferenceSeparator(
    id: number,
    separator: string,
  ): Promise<ProcessView> {
    await this.findOrFail(id);
    if (!REFERENCE_SEPARATORS.includes(separator)) {
      throw validationError('referenceSeparator', [
        'Only no separator or a space are allowed.',
      ]);
    }
    await this.processRepository.update(id, { referenceSeparator: separator });
    return this.findOrFail(id);
  }

  /** Sets the order of every process at once: `ids` must list all active ones */
  async reorder(ids: number[]): Promise<ProcessView[]> {
    const active = await this.processRepository.find({
      where: { deletedAt: IsNull() },
    });
    const activeIds = new Set(active.map((process) => process.id));
    if (
      ids.length !== activeIds.size ||
      !ids.every((id) => activeIds.has(id))
    ) {
      throw validationError('ids', [
        'The order must list every active process exactly once.',
      ]);
    }
    await this.dataSource.transaction(async (manager) => {
      for (const [position, id] of ids.entries()) {
        await manager.getRepository(PhantomProcess).update(id, { position });
      }
    });
    return this.list();
  }

  async remove(id: number): Promise<void> {
    const process = await this.findOrFail(id);
    if (process.phantomItemsCount > 0) {
      throw new ConflictException(
        `The process "${process.name}" still has ${process.phantomItemsCount} phantom item(s)`,
      );
    }
    await this.processRepository.update(id, { deletedAt: new Date() });
  }

  async setColumns(
    id: number,
    columns: ProcessColumnDef[],
  ): Promise<ProcessView> {
    await this.findOrFail(id);
    const problems = validateProcessColumns(columns);
    if (problems.length > 0) throw validationError('columns', problems);
    await this.dataSource.transaction((manager) =>
      this.writeColumns(manager, id, columns),
    );
    return this.findOrFail(id);
  }

  async createFamily(
    processId: number,
    name: string,
  ): Promise<{ id: number; name: string }> {
    await this.findOrFail(processId);
    const trimmed = name?.trim() ?? '';
    if (trimmed === '')
      throw validationError('name', ['The family needs a name.']);
    const existing = await this.findFamily(processId, trimmed);
    if (existing)
      throw new ConflictException(
        `The family "${existing.name}" already exists in this process`,
      );
    const saved = await this.familyRepository.save({
      processId,
      name: trimmed,
    });
    return { id: saved.id, name: saved.name };
  }

  async renameFamily(
    familyId: number,
    name: string,
  ): Promise<{ id: number; name: string }> {
    const family = await this.familyRepository.findOne({
      where: { id: familyId, deletedAt: IsNull() },
    });
    if (!family)
      throw new NotFoundException(`Phantom family ${familyId} does not exist`);
    const trimmed = name?.trim() ?? '';
    if (trimmed === '')
      throw validationError('name', ['The family needs a name.']);
    const existing = await this.findFamily(family.processId, trimmed);
    if (existing && existing.id !== familyId) {
      throw new ConflictException(
        `The family "${existing.name}" already exists in this process`,
      );
    }
    await this.familyRepository.update(familyId, { name: trimmed });
    return { id: familyId, name: trimmed };
  }

  /**
   * The family with this name in the process, created if missing. Used by the
   * importer and by the editor's free-text family field.
   */
  async getOrCreateFamily(
    processId: number,
    name: string,
    manager?: EntityManager,
  ): Promise<number> {
    const existing = await this.findFamily(processId, name, manager);
    if (existing) return existing.id;
    const repository =
      manager?.getRepository(PhantomFamily) ?? this.familyRepository;
    const saved = await repository.save({ processId, name: name.trim() });
    return saved.id;
  }

  /** Ensures a family id belongs to the process */
  async assertFamilyInProcess(
    processId: number,
    familyId: number,
  ): Promise<void> {
    const family = await this.familyRepository.findOne({
      where: { id: familyId, deletedAt: IsNull() },
    });
    if (!family || family.processId !== processId) {
      throw validationError('familyId', [
        'The family does not belong to the process.',
      ]);
    }
  }

  private async findFamily(
    processId: number,
    name: string,
    manager?: EntityManager,
  ): Promise<PhantomFamily | undefined> {
    const repository =
      manager?.getRepository(PhantomFamily) ?? this.familyRepository;
    const families = await repository.find({
      where: { processId, deletedAt: IsNull() },
    });
    return families.find((family) => sameName(family.name, name));
  }

  private async assertNameAvailable(
    name: string,
    exceptId?: number,
  ): Promise<void> {
    const active = await this.processRepository.find({
      where: { deletedAt: IsNull() },
    });
    const clash = active.find(
      (process) => process.id !== exceptId && sameName(process.name, name),
    );
    if (clash)
      throw new ConflictException(`The process "${clash.name}" already exists`);
  }

  private async writeColumns(
    manager: EntityManager,
    processId: number,
    columns: ProcessColumnDef[],
  ): Promise<void> {
    const repository = manager.getRepository(PhantomProcessColumn);
    await repository.delete({ processId });
    await repository.insert(
      columns.map((column, position) => ({
        processId,
        position,
        key: column.key,
        header: column.header.trim(),
        scope: column.scope,
      })),
    );
  }
}
