import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SemiFinished } from './entities/semiFinished.entity';
import { BillOfMaterialsNode } from '../bill-of-materials/entities/bill-of-materials-node.entity';
import { CreateSemiFinishedDto } from './dtos/create-semi-finished.dto';
import { UpdateSemiFinishedDto } from './dtos/update-semi-finished.dto';

export type SemiFinishedWithUsage = SemiFinished & { bomCount: number };

/** Cuántos códigos de estructura se nombran en el mensaje de «en uso». */
const MAX_BOMS_IN_MESSAGE = 5;

const normalizeCode = (code: string): string => code.trim().toLowerCase();

@Injectable()
export class SemiFinishedService {
  constructor(
    @InjectRepository(SemiFinished)
    private readonly semiFinishedRepository: Repository<SemiFinished>,
    @InjectRepository(BillOfMaterialsNode)
    private readonly nodeRepository: Repository<BillOfMaterialsNode>,
  ) {}

  /** Los semielaborados activos, por código: lo que ofrecen los selectores. */
  async findAll(): Promise<SemiFinished[]> {
    return this.semiFinishedRepository.find({
      where: { deletedAt: IsNull() },
      order: { code: 'ASC' },
    });
  }

  /** Los activos con cuántas estructuras activas los tienen en su árbol. */
  async findAdminList(): Promise<SemiFinishedWithUsage[]> {
    const [items, usage] = await Promise.all([
      this.findAll(),
      this.bomCodesBySemiFinished(),
    ]);
    return items.map((item) => ({
      ...item,
      bomCount: usage.get(item.id)?.size ?? 0,
    }));
  }

  async findOne(id: number): Promise<SemiFinished> {
    const item = await this.semiFinishedRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!item) {
      throw new NotFoundException(`Semielaborado con id ${id} no encontrado`);
    }
    return item;
  }

  async create(dto: CreateSemiFinishedDto): Promise<SemiFinished> {
    const code = dto.code.trim();
    await this.assertCodeAvailable(code);
    return this.semiFinishedRepository.save(
      this.semiFinishedRepository.create({ code, name: dto.name.trim() }),
    );
  }

  async update(id: number, dto: UpdateSemiFinishedDto): Promise<SemiFinished> {
    const item = await this.findOne(id);
    const changes: Partial<SemiFinished> = {};
    if (dto.code !== undefined) {
      changes.code = dto.code.trim();
      await this.assertCodeAvailable(changes.code, id);
    }
    if (dto.name !== undefined) changes.name = dto.name.trim();
    if (Object.keys(changes).length > 0) {
      await this.semiFinishedRepository.update(id, changes);
    }
    return { ...item, ...changes };
  }

  /**
   * Baja lógica. Un semielaborado que está en el árbol de una estructura
   * activa no se puede retirar: el nodo quedaría apuntando a algo que no se
   * ofrece. Plantillas y normas guardan su propia copia y no lo impiden.
   */
  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    const boms = [...((await this.bomCodesBySemiFinished()).get(id) ?? [])];
    if (boms.length > 0) {
      const named = boms.slice(0, MAX_BOMS_IN_MESSAGE).join(', ');
      const rest = boms.length - MAX_BOMS_IN_MESSAGE;
      throw new ConflictException(
        `El semielaborado ${item.code} se usa en las estructuras: ${named}` +
          (rest > 0 ? ` y ${rest} más` : ''),
      );
    }
    await this.semiFinishedRepository.update(id, { deletedAt: new Date() });
  }

  private async assertCodeAvailable(
    code: string,
    exceptId?: number,
  ): Promise<void> {
    const wanted = normalizeCode(code);
    const active = await this.findAll();
    const taken = active.find(
      (item) => item.id !== exceptId && normalizeCode(item.code) === wanted,
    );
    if (taken) {
      throw new ConflictException(
        `Ya existe un semielaborado con el código ${code}`,
      );
    }
  }

  /** Por semielaborado, los códigos de las estructuras activas que lo usan. */
  private async bomCodesBySemiFinished(): Promise<Map<number, Set<string>>> {
    const nodes = await this.nodeRepository.find({
      where: { deletedAt: IsNull() },
      relations: { billOfMaterials: true },
    });
    const usage = new Map<number, Set<string>>();
    for (const node of nodes) {
      const bom = node.billOfMaterials;
      if (!bom || bom.deletedAt) continue;
      const codes = usage.get(node.semiFinishedId) ?? new Set<string>();
      codes.add(bom.code);
      usage.set(node.semiFinishedId, codes);
    }
    return usage;
  }
}
