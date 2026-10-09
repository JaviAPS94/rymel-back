import { InMemoryProcessService } from '../testing/in-memory-process.service';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PhantomItemExportService } from './phantom-item-export.service';
import { PhantomItemImportService } from './phantom-item-import.service';
import { PhantomItemService } from './phantom-item.service';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import { PhantomItemImportMode } from '../dtos/import-phantom-items.dto';

/**
 * Verifies the "round trip" scenario from the phantom-item-excel-io spec:
 * exporting a catalog and reimporting it in upsert mode must reproduce it
 * identically.
 */
describe('Phantom items: export and reimport', () => {
  let tempDir: string;

  const catalog: PhantomItem[] = [
    {
      id: 1,
      finishedProductType: '1CA',
      workInProcessType: 'TPI',
      phantomRootCode: 'KIT EMBLE',
      kvaRatingStandard: '-GY-GENERICO-AD-AZ',
      itemCode: '500190',
      reference: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
      itemDescription: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
      shortDescription: 'FANTASMA KIT EMBLE',
      unitOfMeasure: 'UND',
      referenceLengthLimit: 40,
      formulaOverrides: null,
      processId: 1,
      familyId: null,
      extraValues: null,
    } as PhantomItem,
    {
      id: 2,
      finishedProductType: '3CV',
      workInProcessType: 'EEN',
      phantomRootCode: 'KIT ENCU',
      kvaRatingStandard: ' 43_3/4_4H_125',
      itemCode: '500452',
      reference: 'F-3CV-EEN-KIT ENCU 43_3/4_4H_125',
      itemDescription: 'F-3CV-EEN-KIT ENCU 43_3/4_4H_125',
      shortDescription: 'FANTASMA KIT ENCU',
      unitOfMeasure: 'UND',
      referenceLengthLimit: 40,
      formulaOverrides: null,
      processId: 1,
      familyId: null,
      extraValues: null,
    } as PhantomItem,
  ];

  const components: PhantomItemComponent[] = [
    {
      id: 1,
      phantomItemId: 1,
      sortOrder: 0,
      componentItemCode: '4789',
      description: 'PAPEL TIPO INGENIERIA AZUL REF 3275',
      baseQuantity: 100,
      requiredQuantity: 9.87,
      requiredQuantityPerUnit: 0.0987,
      componentUnitOfMeasure: 'MTS',
      wastePercentage: 0,
      consumptionWarehouse: 'PI01',
      formulaOverrides: null,
    } as PhantomItemComponent,
    {
      id: 2,
      phantomItemId: 1,
      sortOrder: 1,
      componentItemCode: '4791',
      description: 'PAPEL TRANSPORTADOR TRANSPARENTE USA',
      baseQuantity: 100,
      requiredQuantity: 13.5,
      requiredQuantityPerUnit: 0.135,
      componentUnitOfMeasure: 'MTS',
      wastePercentage: 0,
      consumptionWarehouse: 'PI01',
      formulaOverrides: null,
    } as PhantomItemComponent,
    {
      id: 3,
      phantomItemId: 2,
      sortOrder: 0,
      componentItemCode: '306',
      description: 'ARANDELA PLANA 1/2" GALV.',
      baseQuantity: 1,
      requiredQuantity: 4,
      requiredQuantityPerUnit: 4,
      componentUnitOfMeasure: 'UND',
      wastePercentage: 0,
      consumptionWarehouse: 'ENC01',
      formulaOverrides: null,
    } as PhantomItemComponent,
  ];

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'phantom-item-roundtrip-'));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reproduces the full catalog without duplicates or lost components', async () => {
    // --- Export ---
    const exportPhantomItemRepository = {
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(catalog),
      })),
    } as unknown as Repository<PhantomItem>;

    const exportComponentRepository = {
      find: jest.fn().mockResolvedValue(components),
    } as unknown as Repository<PhantomItemComponent>;

    const processes = new InMemoryProcessService();
    const exportService = new PhantomItemExportService(
      exportPhantomItemRepository,
      exportComponentRepository,
      processes.asService(),
    );

    const buffer = await exportService.export({});
    const path = join(tempDir, 'roundtrip.xlsx');
    await writeFile(path, Buffer.from(buffer as ArrayBuffer));

    // --- Reimport in upsert mode, with the items already existing ---
    const written = new Map<number, Partial<PhantomItemComponent>[]>();
    const updatedHeaders: { id: number; header: Partial<PhantomItem> }[] = [];

    const importPhantomItemRepository = {
      findOne: jest.fn(async ({ where }: { where: { itemCode: string } }) =>
        catalog.find((phantomItem) => phantomItem.itemCode === where.itemCode),
      ),
    } as unknown as Repository<PhantomItem>;

    const managerComponentRepository = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      insert: jest.fn(async (rows: Partial<PhantomItemComponent>[]) => {
        rows.forEach((component) => {
          const list = written.get(component.phantomItemId) ?? [];
          list.push(component);
          written.set(component.phantomItemId, list);
        });
        return { identifiers: [] };
      }),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === PhantomItem
          ? {
              save: jest.fn(),
              update: jest.fn(
                async (id: number, header: Partial<PhantomItem>) => {
                  updatedHeaders.push({ id, header });
                  return { affected: 1 };
                },
              ),
            }
          : managerComponentRepository,
      ),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      ),
    } as unknown as DataSource;

    const phantomItemService = new PhantomItemService(
      importPhantomItemRepository,
      {} as Repository<PhantomItemComponent>,
      dataSource,
      processes.asService(),
    );

    const importService = new PhantomItemImportService(
      importPhantomItemRepository,
      phantomItemService,
      dataSource,
      processes.asService(),
    );

    const result = await importService.import(
      path,
      PhantomItemImportMode.UPSERT,
      false,
    );

    // --- Verify equivalence ---
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.updated).toBe(2);
    expect(result.created).toBe(0);
    expect(result.phantomItemsDetected).toBe(2);
    expect(result.rowsRead).toBe(3);

    // Headers identical to the originals
    const byId = new Map(
      updatedHeaders.map((entry) => [entry.id, entry.header]),
    );
    expect(byId.get(1)).toMatchObject({
      itemCode: '500190',
      reference: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
      shortDescription: 'FANTASMA KIT EMBLE',
    });
    expect(byId.get(2)).toMatchObject({
      itemCode: '500452',
      reference: 'F-3CV-EEN-KIT ENCU 43_3/4_4H_125',
      shortDescription: 'FANTASMA KIT ENCU',
    });

    // Same number of components per phantom item
    expect(written.get(1)).toHaveLength(2);
    expect(written.get(2)).toHaveLength(1);

    // Same quantities, including derived ones
    const [first, second] = written.get(1);
    expect(first).toMatchObject({
      componentItemCode: '4789',
      baseQuantity: 100,
      requiredQuantity: 9.87,
      componentUnitOfMeasure: 'MTS',
      consumptionWarehouse: 'PI01',
    });
    expect(first.requiredQuantityPerUnit).toBeCloseTo(0.0987, 6);
    expect(second.requiredQuantityPerUnit).toBeCloseTo(0.135, 6);

    const [third] = written.get(2);
    expect(third).toMatchObject({
      componentItemCode: '306',
      description: 'ARANDELA PLANA 1/2" GALV.',
      baseQuantity: 1,
      requiredQuantity: 4,
      consumptionWarehouse: 'ENC01',
    });
  });
});
