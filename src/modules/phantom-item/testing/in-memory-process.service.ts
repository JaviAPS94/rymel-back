import { NotFoundException } from '@nestjs/common';
import type {
  PhantomProcessService,
  ProcessView,
} from '../services/phantom-process.service';
import {
  ProcessColumnDef,
  defaultProcessColumns,
  sameName,
} from '../utils/process-columns';

/**
 * Processes and families in memory, for unit tests of the services that
 * depend on them. Starts with a «General» process with the catalog columns,
 * like the migration.
 */
export class InMemoryProcessService {
  processes: ProcessView[] = [];
  private nextId = 1;
  private nextFamilyId = 1;

  constructor(
    initial: { name: string; columns?: ProcessColumnDef[] }[] = [
      { name: 'General' },
    ],
  ) {
    initial.forEach(({ name, columns }) =>
      this.add(name, columns ?? defaultProcessColumns()),
    );
  }

  private add(
    name: string,
    columns: ProcessColumnDef[],
    referenceSeparator = '',
  ): ProcessView {
    const process: ProcessView = {
      id: this.nextId++,
      name,
      position: this.processes.length,
      referenceSeparator,
      columns,
      families: [],
      phantomItemsCount: 0,
    };
    this.processes.push(process);
    return process;
  }

  async list(): Promise<ProcessView[]> {
    return this.processes;
  }

  async findOrFail(id: number): Promise<ProcessView> {
    const process = this.processes.find((item) => item.id === id);
    if (!process)
      throw new NotFoundException(`Phantom process ${id} does not exist`);
    return process;
  }

  async findByName(name: string): Promise<ProcessView | undefined> {
    return this.processes.find((process) => sameName(process.name, name));
  }

  async create(
    name: string,
    columns: ProcessColumnDef[] = defaultProcessColumns(),
    { referenceSeparator = '' }: { referenceSeparator?: string } = {},
  ): Promise<ProcessView> {
    return this.add(name, columns, referenceSeparator);
  }

  async getOrCreateFamily(processId: number, name: string): Promise<number> {
    const process = await this.findOrFail(processId);
    const existing = process.families.find((family) =>
      sameName(family.name, name),
    );
    if (existing) return existing.id;
    const family = {
      id: this.nextFamilyId++,
      name: name.trim(),
      phantomItemsCount: 0,
    };
    process.families.push(family);
    return family.id;
  }

  async assertFamilyInProcess(
    processId: number,
    familyId: number,
  ): Promise<void> {
    const process = await this.findOrFail(processId);
    if (!process.families.some((family) => family.id === familyId)) {
      throw new Error('The family does not belong to the process.');
    }
  }

  /** Typed as the real service, for constructors */
  asService(): PhantomProcessService {
    return this as unknown as PhantomProcessService;
  }
}
