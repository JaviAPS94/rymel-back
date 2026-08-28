import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PhantomItemImportService } from './phantom-item-import.service';
import { PhantomItemService } from './phantom-item.service';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import { PhantomItemImportMode } from '../dtos/import-phantom-items.dto';
import { PHANTOM_ITEM_COLUMNS } from '../constants/phantom-item-columns';

const HEADERS = PHANTOM_ITEM_COLUMNS.map((column) => column.header);
const LIMITS = PHANTOM_ITEM_COLUMNS.map((column) =>
  column.scope === 'LENGTH' ? (column.lengthLimit ?? 40) : null,
);

/** Builds a flat A–T row from the fields that matter */
const row = (values: Partial<Record<string, unknown>>): unknown[] =>
  PHANTOM_ITEM_COLUMNS.map((column) => values[column.field] ?? null);

const KIT_EMBLE_HEADER = {
  finishedProductType: '1CA',
  workInProcessType: 'TPI',
  phantomRootCode: 'KIT EMBLE',
  kvaRatingStandard: '-GY-GENERICO-AD-AZ',
  itemCode: '500190',
  unitOfMeasure: 'UND',
};

const KIT_ENCU_HEADER = {
  finishedProductType: '3CV',
  workInProcessType: 'EEN',
  phantomRootCode: 'KIT ENCU',
  kvaRatingStandard: ' 43_3/4_4H_125',
  itemCode: '500452',
  unitOfMeasure: 'UND',
};

describe('PhantomItemImportService', () => {
  let service: PhantomItemImportService;
  let phantomItemService: PhantomItemService;
  let phantomItemRepository: jest.Mocked<Partial<Repository<PhantomItem>>>;
  let dataSource: DataSource;
  let tempDir: string;

  /** Components written, keyed by phantom item id */
  let writtenComponents: Map<number, unknown[]>;
  let savedHeaders: Partial<PhantomItem>[];
  let updatedHeaders: { id: number; header: Partial<PhantomItem> }[];

  const createFile = async (
    dataRows: unknown[][],
    options: { headers?: unknown[]; includeLimitsRow?: boolean } = {},
  ): Promise<string> => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('ITEMS FANTASMAS');

    if (options.includeLimitsRow !== false) sheet.addRow(LIMITS);
    sheet.addRow(options.headers ?? HEADERS);
    dataRows.forEach((dataRow) => sheet.addRow(dataRow));

    const path = join(
      tempDir,
      `phantom-items-${Date.now()}-${Math.random()}.xlsx`,
    );
    await workbook.xlsx.writeFile(path);
    return path;
  };

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'phantom-item-import-'));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    writtenComponents = new Map();
    savedHeaders = [];
    updatedHeaders = [];
    let nextId = 1;

    phantomItemRepository = { findOne: jest.fn().mockResolvedValue(null) };

    const componentRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<PhantomItemComponent>;

    const managerPhantomItemRepository = {
      save: jest.fn(async (header: Partial<PhantomItem>) => {
        savedHeaders.push(header);
        return { ...header, id: nextId++ } as PhantomItem;
      }),
      update: jest.fn(async (id: number, header: Partial<PhantomItem>) => {
        updatedHeaders.push({ id, header });
        return { affected: 1 };
      }),
    };

    const managerComponentRepository = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      insert: jest.fn(async (rows: unknown[]) => {
        rows.forEach((component) => {
          const phantomItemId = (component as { phantomItemId: number })
            .phantomItemId;
          const list = writtenComponents.get(phantomItemId) ?? [];
          list.push(component);
          writtenComponents.set(phantomItemId, list);
        });
        return { identifiers: [] };
      }),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === PhantomItem
          ? managerPhantomItemRepository
          : managerComponentRepository,
      ),
    } as unknown as EntityManager;

    dataSource = {
      transaction: jest.fn(
        async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      ),
    } as unknown as DataSource;

    phantomItemService = new PhantomItemService(
      phantomItemRepository as Repository<PhantomItem>,
      componentRepository,
      dataSource,
    );

    service = new PhantomItemImportService(
      phantomItemRepository as Repository<PhantomItem>,
      phantomItemService,
      dataSource,
    );
  });

  describe('grouping', () => {
    it('groups 5 rows of the same item into 1 phantom item with 5 components', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          description: 'PAPEL TIPO INGENIERIA AZUL REF 3275',
          baseQuantity: '100,00',
          requiredQuantity: '9,87',
          componentUnitOfMeasure: 'MTS',
          wastePercentage: '0%',
          consumptionWarehouse: 'PI01',
        }),
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4788',
          description: 'PAPEL TIPO INGENIERIA AMARILLO REF 3271',
          baseQuantity: '100,00',
          requiredQuantity: '0,72',
          componentUnitOfMeasure: 'MTS',
          consumptionWarehouse: 'PI01',
        }),
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '9718',
          description: 'PAPEL VINILO NEGRO BTE',
          baseQuantity: '100,00',
          requiredQuantity: '2,91',
          componentUnitOfMeasure: 'MTS',
          consumptionWarehouse: 'PI01',
        }),
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4791',
          description: 'PAPEL TRANSPORTADOR TRANSPARENTE USA',
          baseQuantity: '100,00',
          requiredQuantity: '13,50',
          componentUnitOfMeasure: 'MTS',
          consumptionWarehouse: 'PI01',
        }),
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '698',
          description: 'PINTURA LIQUIDA LACA NEGRA REF. 7518',
          baseQuantity: '100,00',
          requiredQuantity: '0,05',
          componentUnitOfMeasure: 'GLS',
          consumptionWarehouse: 'PI01',
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.errors).toEqual([]);
      expect(result.created).toBe(1);
      expect(result.phantomItemsDetected).toBe(1);
      expect(result.rowsRead).toBe(5);
      expect(writtenComponents.get(1)).toHaveLength(5);
    });

    it('derives the header with the correct reference and per-unit quantities', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: '100,00',
          requiredQuantity: '9,87',
        }),
      ]);

      await service.import(path, PhantomItemImportMode.CREATE, false);

      expect(savedHeaders[0]).toMatchObject({
        itemCode: '500190',
        reference: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
        itemDescription: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
        shortDescription: 'FANTASMA KIT EMBLE',
      });

      const [component] = writtenComponents.get(1) as {
        requiredQuantityPerUnit: number;
        wastePercentage: number;
      }[];
      expect(component.requiredQuantityPerUnit).toBeCloseTo(0.0987, 6);
    });

    it('separates two different items into two phantom items', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4788',
          baseQuantity: 100,
          requiredQuantity: 0.72,
        }),
        row({
          ...KIT_ENCU_HEADER,
          componentItemCode: '306',
          baseQuantity: 1,
          requiredQuantity: 4,
        }),
        row({
          ...KIT_ENCU_HEADER,
          componentItemCode: '315',
          baseQuantity: 1,
          requiredQuantity: 2,
        }),
        row({
          ...KIT_ENCU_HEADER,
          componentItemCode: '681',
          baseQuantity: 100,
          requiredQuantity: 16.66,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.created).toBe(2);
      expect(result.phantomItemsDetected).toBe(2);
      expect(writtenComponents.get(1)).toHaveLength(2);
      expect(writtenComponents.get(2)).toHaveLength(3);
    });

    it('preserves the leading space of R kVA + Norma, which is the reference separator', async () => {
      const path = await createFile([
        row({
          ...KIT_ENCU_HEADER,
          componentItemCode: '306',
          baseQuantity: 1,
          requiredQuantity: 4,
        }),
      ]);

      await service.import(path, PhantomItemImportMode.CREATE, false);

      expect(savedHeaders[0].reference).toBe(
        'F-3CV-EEN-KIT ENCU 43_3/4_4H_125',
      );
      expect(savedHeaders[0].reference).toHaveLength(32);
    });

    it('trims extra whitespace at the end of fields', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          finishedProductType: '  1CA  ',
          componentItemCode: '  4789  ',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
      ]);

      await service.import(path, PhantomItemImportMode.CREATE, false);

      expect(savedHeaders[0].finishedProductType).toBe('1CA');
      expect(
        (writtenComponents.get(1) as { componentItemCode: string }[])[0]
          .componentItemCode,
      ).toBe('4789');
    });

    it('attaches rows without a repeated item to the open group', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
        row({
          componentItemCode: '4788',
          baseQuantity: 100,
          requiredQuantity: 0.72,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.created).toBe(1);
      expect(writtenComponents.get(1)).toHaveLength(2);
    });
  });

  describe('row validation', () => {
    it('reports the row with a non-numeric quantity and continues with the rest', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 'N/A',
          requiredQuantity: 9.87,
        }),
        row({
          componentItemCode: '4788',
          baseQuantity: 100,
          requiredQuantity: 0.72,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ column: 'CANT. BASE' });
      expect(result.errors[0].message).toContain('N/A');
      expect(result.created).toBe(1);
      expect(writtenComponents.get(1)).toHaveLength(1);
    });

    it('reports the row without a component item', async () => {
      const path = await createFile([
        row({ ...KIT_EMBLE_HEADER, baseQuantity: 100, requiredQuantity: 9.87 }),
        row({
          componentItemCode: '4788',
          baseQuantity: 100,
          requiredQuantity: 0.72,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.errors[0]).toMatchObject({ column: 'ÍTEM - COMPONENTE' });
      expect(writtenComponents.get(1)).toHaveLength(1);
    });

    it('reports the row without a header item when there is no open group', async () => {
      const path = await createFile([
        row({
          componentItemCode: '4788',
          baseQuantity: 100,
          requiredQuantity: 0.72,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ column: 'item' });
      expect(result.created).toBe(0);
    });

    it('skips the group whose rows are all invalid', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 'N/A',
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('skips the group whose reference exceeds the limit', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          phantomRootCode:
            'KIT CON UN NOMBRE EXCESIVAMENTE LARGO PARA LA REFERENCIA',
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].message).toContain('exceeds the limit');
    });
  });

  describe('header detection', () => {
    it('detects the header in row 2, below the limits row', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.rowsRead).toBe(1);
      expect(result.created).toBe(1);
    });

    it('detects the header when it is on the first row', async () => {
      const path = await createFile(
        [
          row({
            ...KIT_EMBLE_HEADER,
            componentItemCode: '4789',
            baseQuantity: 100,
            requiredQuantity: 9.87,
          }),
        ],
        { includeLimitsRow: false },
      );

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.created).toBe(1);
    });

    it('rejects a file missing a required column', async () => {
      const headersWithoutComponent = HEADERS.map((header) =>
        header === 'ÍTEM - COMPONENTE' ? 'OTRA COSA' : header,
      );

      const path = await createFile(
        [
          row({
            ...KIT_EMBLE_HEADER,
            baseQuantity: 100,
            requiredQuantity: 9.87,
          }),
        ],
        { headers: headersWithoutComponent },
      );

      await expect(
        service.import(path, PhantomItemImportMode.CREATE, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a file without recognizable headers', async () => {
      const path = await createFile([['a', 'b', 'c']], {
        headers: ['uno', 'dos', 'tres'],
      });

      await expect(
        service.import(path, PhantomItemImportMode.CREATE, false),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('warnings', () => {
    it('warns when the header differs within a group and keeps the first', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
        row({
          ...KIT_EMBLE_HEADER,
          phantomRootCode: 'KIT OTRO',
          componentItemCode: '4788',
          baseQuantity: 100,
          requiredQuantity: 0.72,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('KIT OTRO');
      expect(savedHeaders[0].phantomRootCode).toBe('KIT EMBLE');
    });

    it('preserves the file reference when it differs from the calculated one', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          reference: 'F-REFERENCIA-MANUAL',
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(savedHeaders[0].reference).toBe('F-REFERENCIA-MANUAL');
      expect(savedHeaders[0].formulaOverrides).toContain('F-REFERENCIA-MANUAL');
      expect(
        result.warnings.some((warning) =>
          warning.message.includes("file's value is kept"),
        ),
      ).toBe(true);
    });

    it('does not warn when the file reference matches the calculated one', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          reference: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
          shortDescription: 'FANTASMA KIT EMBLE',
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.warnings).toEqual([]);
    });
  });

  describe('conflict modes', () => {
    it('skips the existing item in create mode', async () => {
      (phantomItemRepository.findOne as jest.Mock).mockResolvedValue({
        id: 7,
        itemCode: '500190',
      });

      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].message).toContain('already exists');
      expect(savedHeaders).toHaveLength(0);
    });

    it('updates the existing item in upsert mode, replacing its components', async () => {
      (phantomItemRepository.findOne as jest.Mock).mockResolvedValue({
        id: 7,
        itemCode: '500190',
      });

      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
        row({
          componentItemCode: '4788',
          baseQuantity: 100,
          requiredQuantity: 0.72,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.UPSERT,
        false,
      );

      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
      expect(updatedHeaders[0].id).toBe(7);
      expect(writtenComponents.get(7)).toHaveLength(2);
    });
  });

  describe('dryRun', () => {
    it('reports the result without writing to the database', async () => {
      const path = await createFile([
        row({
          ...KIT_EMBLE_HEADER,
          componentItemCode: '4789',
          baseQuantity: 100,
          requiredQuantity: 9.87,
        }),
        row({
          componentItemCode: '4788',
          baseQuantity: 'N/A',
          requiredQuantity: 0.72,
        }),
      ]);

      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        true,
      );

      expect(result.dryRun).toBe(true);
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(savedHeaders).toHaveLength(0);
      expect(writtenComponents.size).toBe(0);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('volume', () => {
    it('processes a 5,000-row file', async () => {
      const rows = Array.from({ length: 5000 }, (_, index) =>
        row({
          ...KIT_EMBLE_HEADER,
          itemCode: `5001${Math.floor(index / 10)}`,
          componentItemCode: `${1000 + index}`,
          baseQuantity: 100,
          requiredQuantity: 1,
        }),
      );

      const path = await createFile(rows);
      const result = await service.import(
        path,
        PhantomItemImportMode.CREATE,
        true,
      );

      expect(result.rowsRead).toBe(5000);
      expect(result.phantomItemsDetected).toBe(500);
      expect(result.errors).toEqual([]);
    }, 60000);
  });
});
