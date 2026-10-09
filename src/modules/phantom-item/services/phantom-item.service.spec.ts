import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PhantomItemService } from './phantom-item.service';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import { InMemoryProcessService } from '../testing/in-memory-process.service';

const BASE_DTO = {
  finishedProductType: '1CA',
  workInProcessType: 'TPI',
  phantomRootCode: 'KIT EMBLE',
  kvaRatingStandard: '-GY-GENERICO-AD-AZ',
  itemCode: '500190',
  unitOfMeasure: 'UND',
};

describe('PhantomItemService', () => {
  let service: PhantomItemService;
  let phantomItemRepository: jest.Mocked<Partial<Repository<PhantomItem>>>;
  let componentRepository: jest.Mocked<
    Partial<Repository<PhantomItemComponent>>
  >;
  let dataSource: DataSource;

  let savedHeaders: Partial<PhantomItem>[];
  let insertedComponents: Partial<PhantomItemComponent>[];
  let softDeletedComponents: unknown[];

  beforeEach(() => {
    savedHeaders = [];
    insertedComponents = [];
    softDeletedComponents = [];

    phantomItemRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    componentRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: 2 }),
      })) as never,
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === PhantomItem
          ? {
              save: jest.fn(async (header: Partial<PhantomItem>) => {
                savedHeaders.push(header);
                return { ...header, id: 1 };
              }),
              update: jest.fn().mockResolvedValue({ affected: 1 }),
            }
          : {
              update: jest.fn(async (...args: unknown[]) => {
                softDeletedComponents.push(args);
                return { affected: 1 };
              }),
              insert: jest.fn(async (rows: Partial<PhantomItemComponent>[]) => {
                insertedComponents.push(...rows);
                return { identifiers: [] };
              }),
            },
      ),
    } as unknown as EntityManager;

    dataSource = {
      transaction: jest.fn(
        async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      ),
    } as unknown as DataSource;

    service = new PhantomItemService(
      phantomItemRepository as Repository<PhantomItem>,
      componentRepository as Repository<PhantomItemComponent>,
      dataSource,
      new InMemoryProcessService().asService(),
    );
  });

  describe('buildHeader', () => {
    it('derives the fields and leaves the entity ready to save', () => {
      const header = service.buildHeader(BASE_DTO);

      expect(header).toMatchObject({
        itemCode: '500190',
        reference: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
        itemDescription: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
        shortDescription: 'FANTASMA KIT EMBLE',
        referenceLengthLimit: 40,
      });
      expect(header.formulaOverrides).toBeNull();
    });

    it('serializes the record own formulas', () => {
      const header = service.buildHeader({
        ...BASE_DTO,
        formulaOverrides: { referenceLength: '=LARGO(shortDescription)' },
      });

      expect(JSON.parse(header.formulaOverrides)).toEqual({
        referenceLength: '=LARGO(shortDescription)',
      });
    });

    it('accepts already-serialized formulas from an entity', () => {
      const header = service.buildHeader({
        ...BASE_DTO,
        formulaOverrides: JSON.stringify({
          referenceLength: '=LARGO(shortDescription)',
        }),
      });

      expect(JSON.parse(header.formulaOverrides)).toEqual({
        referenceLength: '=LARGO(shortDescription)',
      });
    });

    it('rejects a header that exceeds the length limit', () => {
      expect(() =>
        service.buildHeader({
          ...BASE_DTO,
          phantomRootCode: 'KIT CON UN NOMBRE MUY LARGO QUE NO CABE',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('buildComponent', () => {
    it('derives the per-unit quantity', () => {
      const component = service.buildComponent(
        {
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        },
        1,
        0,
      );

      expect(component.requiredQuantityPerUnit).toBeCloseTo(0.0987, 6);
      expect(component.phantomItemId).toBe(1);
      expect(component.sortOrder).toBe(0);
    });

    it('leaves the per-unit quantity null if base is zero', () => {
      const component = service.buildComponent(
        { componentItemCode: '4789', baseQuantity: 0, requiredQuantity: 4 },
        1,
        0,
      );

      expect(component.requiredQuantityPerUnit).toBeNull();
    });
  });

  describe('create', () => {
    it('creates the header and its components in a transaction', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as never);

      await service.create({
        ...BASE_DTO,
        components: [
          {
            componentItemCode: '4789',
            baseQuantity: 100,
            requiredQuantity: 9.87,
          },
          {
            componentItemCode: '4788',
            baseQuantity: 100,
            requiredQuantity: 0.72,
          },
        ],
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(savedHeaders).toHaveLength(1);
      expect(insertedComponents).toHaveLength(2);
      expect(insertedComponents[0].sortOrder).toBe(0);
      expect(insertedComponents[1].sortOrder).toBe(1);
    });

    it("builds the reference with the process's rule", async () => {
      const processes = new InMemoryProcessService();
      const alistamiento = await processes.create(
        'ALISTAMIENTO Y ENCUBE',
        undefined,
        {
          referenceSeparator: ' ',
        },
      );
      const withProcesses = new PhantomItemService(
        phantomItemRepository as Repository<PhantomItem>,
        componentRepository as Repository<PhantomItemComponent>,
        dataSource,
        processes.asService(),
      );
      jest
        .spyOn(withProcesses, 'findOne')
        .mockResolvedValue({ id: 1 } as never);

      await withProcesses.create({
        ...BASE_DTO,
        kvaRatingStandard: '0-75 KVA GT',
        processId: alistamiento.id,
      });

      expect(savedHeaders[0].reference).toBe('F-1CA-TPI-KIT EMBLE 0-75 KVA GT');
      expect(savedHeaders[0]).not.toHaveProperty('referenceSeparator');
    });

    it('rejects a duplicate item code', async () => {
      (phantomItemRepository.findOne as jest.Mock).mockResolvedValue({
        id: 9,
        itemCode: '500190',
      });

      await expect(service.create({ ...BASE_DTO })).rejects.toThrow(
        ConflictException,
      );
      expect(savedHeaders).toHaveLength(0);
    });

    it('allows creating without components', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as never);

      await service.create({ ...BASE_DTO });

      expect(savedHeaders).toHaveLength(1);
      expect(insertedComponents).toHaveLength(0);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      (phantomItemRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        ...BASE_DTO,
        reference: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
        itemDescription: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
        shortDescription: 'FANTASMA KIT EMBLE',
        referenceLengthLimit: 40,
        formulaOverrides: null,
      });
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as never);
    });

    it('replaces the full list of components', async () => {
      await service.update(1, {
        components: [
          {
            componentItemCode: '4789',
            baseQuantity: 100,
            requiredQuantity: 9.87,
          },
        ],
      });

      expect(softDeletedComponents).toHaveLength(1);
      expect(insertedComponents).toHaveLength(1);
    });

    it('does not touch components if none are sent', async () => {
      await service.update(1, { unitOfMeasure: 'KG' });

      expect(softDeletedComponents).toHaveLength(0);
      expect(insertedComponents).toHaveLength(0);
    });

    it('recalculates derived fields over the merge of existing and new data', async () => {
      const buildHeaderSpy = jest.spyOn(service, 'buildHeader');

      await service.update(1, { phantomRootCode: 'KIT ENCU' });

      const result = buildHeaderSpy.mock.results[0]
        .value as Partial<PhantomItem>;
      expect(result.reference).toBe('F-1CA-TPI-KIT ENCU-GY-GENERICO-AD-AZ');
      expect(result.shortDescription).toBe('FANTASMA KIT ENCU');
    });

    it('throws 404 if the phantom item does not exist', async () => {
      (phantomItemRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.update(99, { unitOfMeasure: 'KG' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('marks the header and its components as deleted', async () => {
      (phantomItemRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        ...BASE_DTO,
      });

      await service.remove(1);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws 404 if it does not exist', async () => {
      (phantomItemRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMany', () => {
    beforeEach(() => {
      phantomItemRepository.find = jest
        .fn()
        .mockResolvedValue([{ id: 3 }, { id: 7 }] as PhantomItem[]);
    });

    it('deletes the selected phantom items and their components in one transaction', async () => {
      const result = await service.removeMany([3, 7, 3]);

      expect(result).toEqual({ deleted: 2 });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // The components of both, in the same transaction
      expect(softDeletedComponents).toHaveLength(1);
      expect(JSON.stringify(softDeletedComponents[0])).toContain('[3,7]');
    });

    it('deletes nothing if one of them does not exist', async () => {
      await expect(service.removeMany([3, 7, 99])).rejects.toThrow(
        'Phantom items not found: 99',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('individual components', () => {
    it('adds the component with the next available sort order', async () => {
      (phantomItemRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        ...BASE_DTO,
      });
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as never);

      await service.addComponent(1, {
        componentItemCode: '4789',
        baseQuantity: 100,
        requiredQuantity: 9.87,
      });

      const saved = (componentRepository.save as jest.Mock).mock.calls[0][0];
      expect(saved.sortOrder).toBe(3); // the existing max was 2
    });

    it('throws 404 when editing a nonexistent component', async () => {
      (componentRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateComponent(99, { baseQuantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes the component', async () => {
      (componentRepository.findOne as jest.Mock).mockResolvedValue({
        id: 5,
        phantomItemId: 1,
      });

      await service.removeComponent(5);

      const [id, patch] = (componentRepository.update as jest.Mock).mock
        .calls[0];
      expect(id).toBe(5);
      expect(patch.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('replaceComponents', () => {
    it('inserts in batches of 100 to stay under SQL Server parameter limit', async () => {
      // A single instance: getRepository must always return the same one so
      // the spy counts the real calls
      const componentRepositoryMock = {
        update: jest.fn().mockResolvedValue({ affected: 0 }),
        insert: jest.fn(async (rows: Partial<PhantomItemComponent>[]) => {
          insertedComponents.push(...rows);
          return { identifiers: [] };
        }),
      };

      const manager = {
        getRepository: jest.fn(() => componentRepositoryMock),
      } as unknown as EntityManager;

      const components = Array.from({ length: 250 }, (_, index) => ({
        componentItemCode: `${index}`,
        baseQuantity: 1,
        requiredQuantity: 1,
      }));

      await service.replaceComponents(manager, 1, components);

      expect(componentRepositoryMock.insert).toHaveBeenCalledTimes(3);
      expect(insertedComponents).toHaveLength(250);
    });
  });
});
