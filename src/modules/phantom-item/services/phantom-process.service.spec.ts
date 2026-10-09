import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, FindOperator, Repository } from 'typeorm';
import { PhantomProcessService } from './phantom-process.service';
import { PhantomProcess } from '../entities/phantom-process.entity';
import { PhantomFamily } from '../entities/phantom-family.entity';
import { PhantomProcessColumn } from '../entities/phantom-process-column.entity';
import { PhantomItem } from '../entities/phantom-item.entity';
import { defaultProcessColumns } from '../utils/process-columns';

type Row = Record<string, unknown> & { id: number };

/**
 * A table in memory with the slice of the Repository API the service uses.
 * `where` matches by equality; `IsNull()` matches null or undefined.
 */
class FakeTable<T extends Row> {
  rows: T[] = [];
  private nextId = 1;

  private matches(row: T, where: Record<string, unknown> = {}): boolean {
    return Object.entries(where).every(([key, expected]) =>
      expected instanceof FindOperator
        ? row[key] === null || row[key] === undefined
        : row[key] === expected,
    );
  }

  repository(): Repository<T> {
    return {
      find: jest.fn(async (options: { where?: Record<string, unknown> } = {}) =>
        this.rows.filter((row) => this.matches(row, options.where)),
      ),
      findOne: jest.fn(
        async (options: { where: Record<string, unknown> }) =>
          this.rows.find((row) => this.matches(row, options.where)) ?? null,
      ),
      save: jest.fn(async (entity: Partial<T>) => {
        const row = { ...entity, id: this.nextId++ } as T;
        this.rows.push(row);
        return row;
      }),
      insert: jest.fn(async (entities: Partial<T>[]) => {
        entities.forEach((entity) =>
          this.rows.push({ ...entity, id: this.nextId++ } as T),
        );
      }),
      update: jest.fn(async (id: number, changes: Partial<T>) => {
        Object.assign(this.rows.find((row) => row.id === id)!, changes);
      }),
      delete: jest.fn(async (where: Record<string, unknown>) => {
        this.rows = this.rows.filter((row) => !this.matches(row, where));
      }),
      createQueryBuilder: jest.fn(() => {
        const builder = {
          select: () => builder,
          addSelect: () => builder,
          where: () => builder,
          groupBy: () => builder,
          addGroupBy: () => builder,
          getRawOne: async () => ({
            max: this.rows.length
              ? Math.max(...this.rows.map((row) => Number(row.position ?? 0)))
              : null,
          }),
          getRawMany: async () => {
            const counts = new Map<
              string,
              { processId: number; familyId: number | null; count: number }
            >();
            this.rows
              .filter((row) => !row.deletedAt)
              .forEach((row) => {
                const key = `${row.processId}:${row.familyId ?? ''}`;
                const entry = counts.get(key) ?? {
                  processId: row.processId as number,
                  familyId: (row.familyId as number) ?? null,
                  count: 0,
                };
                entry.count++;
                counts.set(key, entry);
              });
            return [...counts.values()];
          },
        };
        return builder;
      }),
    } as unknown as Repository<T>;
  }
}

describe('PhantomProcessService', () => {
  let service: PhantomProcessService;
  let processTable: FakeTable<Row>;
  let familyTable: FakeTable<Row>;
  let columnTable: FakeTable<Row>;
  let itemTable: FakeTable<Row>;

  beforeEach(() => {
    processTable = new FakeTable();
    familyTable = new FakeTable();
    columnTable = new FakeTable();
    itemTable = new FakeTable();

    const repositories = new Map<unknown, Repository<Row>>([
      [PhantomProcess, processTable.repository()],
      [PhantomFamily, familyTable.repository()],
      [PhantomProcessColumn, columnTable.repository()],
      [PhantomItem, itemTable.repository()],
    ]);
    const manager = {
      getRepository: (entity: unknown) => repositories.get(entity),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      ),
      getRepository: (entity: unknown) => repositories.get(entity),
    } as unknown as DataSource;

    service = new PhantomProcessService(
      repositories.get(PhantomProcess) as unknown as Repository<PhantomProcess>,
      repositories.get(PhantomFamily) as unknown as Repository<PhantomFamily>,
      repositories.get(
        PhantomProcessColumn,
      ) as unknown as Repository<PhantomProcessColumn>,
      dataSource,
    );
  });

  describe('processes', () => {
    it('creates at the end with the catalog columns when none are given', async () => {
      await service.create('EMBLEMADO');
      const created = await service.create('METALMECANICA');

      expect(created.position).toBe(1);
      expect(created.columns).toEqual(defaultProcessColumns());
    });

    it('treats names that differ only in case, accents or spaces as the same', async () => {
      await service.create('METALMECANICA');

      await expect(service.create('  Metalmecánica ')).rejects.toThrow(
        ConflictException,
      );
      expect(await service.findByName('metalmecánica')).toMatchObject({
        name: 'METALMECANICA',
      });
    });

    it('rejects an empty name', async () => {
      await expect(service.create('   ')).rejects.toThrow(BadRequestException);
    });

    it("renames, but not onto another process's name", async () => {
      const emblemado = await service.create('EMBLEMADO');
      await service.create('CANASTILLAS');

      await expect(service.rename(emblemado.id, 'canastillas')).rejects.toThrow(
        ConflictException,
      );
      expect((await service.rename(emblemado.id, 'Emblemado')).name).toBe(
        'Emblemado',
      );
    });

    it('reorders only with the full list of active processes', async () => {
      const first = await service.create('EMBLEMADO');
      const second = await service.create('CANASTILLAS');

      await expect(service.reorder([second.id])).rejects.toThrow(
        BadRequestException,
      );
      const reordered = await service.reorder([second.id, first.id]);
      expect(
        reordered
          .sort((a, b) => a.position - b.position)
          .map((process) => process.name),
      ).toEqual(['CANASTILLAS', 'EMBLEMADO']);
    });

    it('removes an empty process, but not one with phantom items', async () => {
      const empty = await service.create('EMBLEMADO');
      const used = await service.create('CANASTILLAS');
      itemTable.rows.push({ id: 1, processId: used.id, familyId: null });

      await expect(service.remove(used.id)).rejects.toThrow(ConflictException);
      await service.remove(empty.id);
      await expect(service.findOrFail(empty.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reference rule', () => {
    it('starts without separator, as the system always built references', async () => {
      expect((await service.create('EMBLEMADO')).referenceSeparator).toBe('');
    });

    it('takes a space, or nothing, and nothing else', async () => {
      const process = await service.create('ALISTAMIENTO Y ENCUBE');

      expect(
        (await service.setReferenceSeparator(process.id, ' '))
          .referenceSeparator,
      ).toBe(' ');
      await expect(
        service.setReferenceSeparator(process.id, '-'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('columns', () => {
    it('replaces the columns in the given order', async () => {
      const process = await service.create('ALISTAMIENTO Y ENCUBE');
      const columns = [
        ...defaultProcessColumns().slice(0, 12),
        { key: 'custom:plan1', header: 'PLAN1', scope: 'HEADER' as never },
        ...defaultProcessColumns().slice(12),
      ];

      const updated = await service.setColumns(process.id, columns);

      expect(updated.columns.map((column) => column.header)).toEqual(
        columns.map((column) => column.header),
      );
    });

    it('does not let a required column be removed', async () => {
      const process = await service.create('EMBLEMADO');
      const withoutComponent = defaultProcessColumns().filter(
        (column) => column.key !== 'componentItemCode',
      );

      await expect(
        service.setColumns(process.id, withoutComponent),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not let «Fantasma» be used as a column header', async () => {
      const process = await service.create('EMBLEMADO');
      const columns = [
        ...defaultProcessColumns(),
        {
          key: 'custom:fantasma',
          header: 'Fantasma',
          scope: 'HEADER' as never,
        },
      ];

      await expect(service.setColumns(process.id, columns)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('families', () => {
    it('creates a family once per process, compared loosely', async () => {
      const process = await service.create('ALISTAMIENTO Y ENCUBE');
      await service.createFamily(process.id, 'F. Acc Alis');

      await expect(
        service.createFamily(process.id, 'f. acc alis'),
      ).rejects.toThrow(ConflictException);
    });

    it('lets two processes have a family with the same name', async () => {
      const first = await service.create('ALISTAMIENTO Y ENCUBE');
      const second = await service.create('CANASTILLAS');
      await service.createFamily(first.id, 'Accesorios');

      await expect(
        service.createFamily(second.id, 'Accesorios'),
      ).resolves.toMatchObject({ name: 'Accesorios' });
    });

    it('reuses the existing family on import instead of creating a twin', async () => {
      const process = await service.create('ALISTAMIENTO Y ENCUBE');
      const id = await service.getOrCreateFamily(process.id, 'F. Acc Alis');

      expect(await service.getOrCreateFamily(process.id, 'F. ACC ALIS ')).toBe(
        id,
      );
      expect(familyTable.rows).toHaveLength(1);
    });

    it("renames, but not onto a sibling's name", async () => {
      const process = await service.create('ALISTAMIENTO Y ENCUBE');
      const first = await service.createFamily(process.id, 'F. Acc Alis');
      await service.createFamily(process.id, 'F.Acc Enc');

      await expect(service.renameFamily(first.id, 'F.ACC ENC')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects a family from another process', async () => {
      const first = await service.create('ALISTAMIENTO Y ENCUBE');
      const second = await service.create('CANASTILLAS');
      const family = await service.createFamily(first.id, 'F. Acc Alis');

      await expect(
        service.assertFamilyInProcess(second.id, family.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('counts phantom items per family and per process', async () => {
      const process = await service.create('ALISTAMIENTO Y ENCUBE');
      const family = await service.createFamily(process.id, 'F. Acc Alis');
      itemTable.rows.push(
        { id: 1, processId: process.id, familyId: family.id },
        { id: 2, processId: process.id, familyId: family.id },
        { id: 3, processId: process.id, familyId: null },
      );

      const view = await service.findOrFail(process.id);

      expect(view.phantomItemsCount).toBe(3);
      expect(view.families).toEqual([
        { id: family.id, name: 'F. Acc Alis', phantomItemsCount: 2 },
      ]);
    });
  });
});
