import { ConflictException, NotFoundException } from '@nestjs/common';
import { FindOperator, Repository } from 'typeorm';
import { SemiFinishedService } from './semiFinished.service';
import { SemiFinished } from './entities/semiFinished.entity';
import { BillOfMaterialsNode } from '../bill-of-materials/entities/bill-of-materials-node.entity';

type Bom = { id: number; code: string; deletedAt: Date | null };
type Node = {
  id: number;
  semiFinishedId: number;
  deletedAt: Date | null;
  billOfMaterials: Bom;
};

/** `where` por igualdad; `IsNull()` acepta null o undefined. */
const matches = (row: object, where: Record<string, unknown> = {}): boolean =>
  Object.entries(where).every(([key, expected]) => {
    const value = (row as Record<string, unknown>)[key];
    return expected instanceof FindOperator
      ? value === null || value === undefined
      : value === expected;
  });

const setup = () => {
  let nextId = 1;
  const items: SemiFinished[] = [];
  const nodes: Node[] = [];

  const repository = {
    find: jest.fn(
      async (options: {
        where?: Record<string, unknown>;
        order?: { code?: 'ASC' };
      }) => {
        const rows = items.filter((row) => matches(row, options.where));
        return options.order?.code
          ? [...rows].sort((a, b) => a.code.localeCompare(b.code))
          : rows;
      },
    ),
    findOne: jest.fn(
      async (options: { where: Record<string, unknown> }) =>
        items.find((row) => matches(row, options.where)) ?? null,
    ),
    create: jest.fn((entity: Partial<SemiFinished>) => entity),
    save: jest.fn(async (entity: Partial<SemiFinished>) => {
      const row = {
        ...entity,
        id: nextId++,
        deletedAt: null,
      } as unknown as SemiFinished;
      items.push(row);
      return row;
    }),
    update: jest.fn(async (id: number, changes: Partial<SemiFinished>) => {
      Object.assign(items.find((row) => row.id === id)!, changes);
    }),
  } as unknown as Repository<SemiFinished>;

  const nodeRepository = {
    find: jest.fn(async (options: { where?: Record<string, unknown> }) =>
      nodes.filter((row) => matches(row, options.where)),
    ),
  } as unknown as Repository<BillOfMaterialsNode>;

  const service = new SemiFinishedService(repository, nodeRepository);

  const add = (code: string, name = code, deletedAt: Date | null = null) => {
    const row = {
      id: nextId++,
      code,
      name,
      deletedAt,
    } as unknown as SemiFinished;
    items.push(row);
    return row;
  };
  let nodeId = 1;
  const useIn = (
    semiFinished: SemiFinished,
    bom: Bom,
    deletedAt: Date | null = null,
  ) =>
    nodes.push({
      id: nodeId++,
      semiFinishedId: semiFinished.id,
      deletedAt,
      billOfMaterials: bom,
    });

  return { service, items, add, useIn };
};

const bom = (id: number, code: string, deletedAt: Date | null = null): Bom => ({
  id,
  code,
  deletedAt,
});

describe('SemiFinishedService', () => {
  describe('findAll', () => {
    it('devuelve solo los activos, ordenados por código', async () => {
      const { service, add } = setup();
      add('SE-02');
      add('SE-01');
      add('SE-00', 'Retirado', new Date());

      const result = await service.findAll();

      expect(result.map((item) => item.code)).toEqual(['SE-01', 'SE-02']);
    });
  });

  describe('findAdminList', () => {
    it('cuenta las estructuras activas distintas que usan cada uno', async () => {
      const { service, add, useIn } = setup();
      const bobina = add('SE-01', 'Bobina');
      const tanque = add('SE-02', 'Tanque');
      const a = bom(1, 'PT: A');
      useIn(bobina, a);
      useIn(bobina, a); // dos nodos en la misma estructura cuentan una vez
      useIn(bobina, bom(2, 'PT: B'));
      useIn(bobina, bom(3, 'PT: C', new Date())); // estructura eliminada
      useIn(tanque, a, new Date()); // nodo eliminado

      const result = await service.findAdminList();

      expect(result.map(({ code, bomCount }) => ({ code, bomCount }))).toEqual([
        { code: 'SE-01', bomCount: 2 },
        { code: 'SE-02', bomCount: 0 },
      ]);
    });
  });

  describe('findOne', () => {
    it('404 si está eliminado', async () => {
      const { service, add } = setup();
      const retired = add('SE-01', 'Bobina', new Date());

      await expect(service.findOne(retired.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('guarda código y nombre recortados', async () => {
      const { service } = setup();

      const created = await service.create({
        code: '  SE-01 ',
        name: ' Bobina ',
      });

      expect(created).toMatchObject({ code: 'SE-01', name: 'Bobina' });
    });

    it('409 si el código ya existe sin distinguir mayúsculas ni espacios', async () => {
      const { service, add } = setup();
      add('SE-01');

      await expect(
        service.create({ code: 'se-01 ', name: 'Otro' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('permite reutilizar el código de uno eliminado', async () => {
      const { service, add } = setup();
      add('SE-01', 'Viejo', new Date());

      await expect(
        service.create({ code: 'SE-01', name: 'Nuevo' }),
      ).resolves.toMatchObject({ code: 'SE-01', name: 'Nuevo' });
    });
  });

  describe('update', () => {
    it('acepta editar el nombre conservando su propio código', async () => {
      const { service, add, items } = setup();
      const bobina = add('SE-01', 'Bobina');

      const updated = await service.update(bobina.id, {
        code: 'SE-01',
        name: 'Bobina grande',
      });

      expect(updated).toMatchObject({ code: 'SE-01', name: 'Bobina grande' });
      expect(items[0].name).toBe('Bobina grande');
    });

    it('409 si toma el código de otro activo', async () => {
      const { service, add } = setup();
      add('SE-01');
      const other = add('SE-02');

      await expect(
        service.update(other.id, { code: 'SE-01' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 si está eliminado', async () => {
      const { service, add } = setup();
      const retired = add('SE-01', 'Bobina', new Date());

      await expect(
        service.update(retired.id, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('marca deleted_at si no se usa en ninguna estructura activa', async () => {
      const { service, add, useIn } = setup();
      const bobina = add('SE-01');
      useIn(bobina, bom(1, 'PT: A', new Date()));

      await service.remove(bobina.id);

      expect(bobina.deletedAt).toBeInstanceOf(Date);
      expect(await service.findAll()).toEqual([]);
    });

    it('409 nombrando las estructuras si está en uso', async () => {
      const { service, add, useIn } = setup();
      const bobina = add('SE-01');
      useIn(bobina, bom(1, 'PT: 1FCV'));

      await expect(service.remove(bobina.id)).rejects.toThrow(
        'El semielaborado SE-01 se usa en las estructuras: PT: 1FCV',
      );
      expect(bobina.deletedAt).toBeNull();
    });

    it('resume cuando lo usan más de cinco estructuras', async () => {
      const { service, add, useIn } = setup();
      const bobina = add('SE-01');
      for (let i = 1; i <= 7; i++) useIn(bobina, bom(i, `E${i}`));

      await expect(service.remove(bobina.id)).rejects.toThrow(
        'E1, E2, E3, E4, E5 y 2 más',
      );
    });

    it('404 si ya estaba eliminado', async () => {
      const { service, add } = setup();
      const retired = add('SE-01', 'Bobina', new Date());

      await expect(service.remove(retired.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
