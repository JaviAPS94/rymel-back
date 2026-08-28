import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PhantomItemExportService } from './phantom-item-export.service';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import { PHANTOM_ITEM_COLUMNS } from '../constants/phantom-item-columns';

const HEADERS = PHANTOM_ITEM_COLUMNS.map((column) => column.header);

const buildPhantomItem = (overrides: Partial<PhantomItem> = {}): PhantomItem =>
  ({
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
    ...overrides,
  }) as PhantomItem;

const buildComponent = (
  overrides: Partial<PhantomItemComponent> = {},
): PhantomItemComponent =>
  ({
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
    ...overrides,
  }) as PhantomItemComponent;

/** Reads the generated buffer and returns its rows as flat arrays */
const readBuffer = async (buffer: ExcelJS.Buffer): Promise<unknown[][]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ArrayBuffer);
  const sheet = workbook.worksheets[0];

  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    rows.push(
      PHANTOM_ITEM_COLUMNS.map((_, index) => values[index + 1] ?? null),
    );
  });
  return rows;
};

describe('PhantomItemExportService', () => {
  let service: PhantomItemExportService;
  let phantomItemRepository: Repository<PhantomItem>;
  let componentRepository: jest.Mocked<
    Partial<Repository<PhantomItemComponent>>
  >;
  let phantomItems: PhantomItem[];

  beforeEach(() => {
    phantomItems = [];

    phantomItemRepository = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => phantomItems),
      })),
    } as unknown as Repository<PhantomItem>;

    componentRepository = { find: jest.fn().mockResolvedValue([]) };

    service = new PhantomItemExportService(
      phantomItemRepository,
      componentRepository as Repository<PhantomItemComponent>,
    );
  });

  describe('buildTemplate', () => {
    it('generates the template with the limits row and the headers', async () => {
      const rows = await readBuffer(await service.buildTemplate());

      expect(rows).toHaveLength(2);
      expect(rows[0][6]).toBe(40); // G: Largo 40/50
      expect(rows[0][8]).toBe(40); // I: Largo 40
      expect(rows[0][10]).toBe(20); // K: Largo 20
      expect(rows[1]).toEqual(HEADERS);
    });

    it('does not include data rows', async () => {
      const rows = await readBuffer(await service.buildTemplate());
      expect(rows).toHaveLength(2);
    });
  });

  describe('export', () => {
    it('writes one row per component, repeating the header', async () => {
      phantomItems = [buildPhantomItem()];
      (componentRepository.find as jest.Mock).mockResolvedValue([
        buildComponent({ id: 1, sortOrder: 0, componentItemCode: '4789' }),
        buildComponent({ id: 2, sortOrder: 1, componentItemCode: '4788' }),
      ]);

      const rows = await readBuffer(await service.export({}));
      const dataRows = rows.slice(2);

      expect(dataRows).toHaveLength(2);
      // Header repeated on both rows
      expect(dataRows[0][0]).toBe('1CA');
      expect(dataRows[1][0]).toBe('1CA');
      expect(dataRows[0][4]).toBe('500190');
      expect(dataRows[1][4]).toBe('500190');
      // Different components
      expect(dataRows[0][12]).toBe('4789');
      expect(dataRows[1][12]).toBe('4788');
    });

    it('writes the calculated lengths', async () => {
      phantomItems = [buildPhantomItem()];
      (componentRepository.find as jest.Mock).mockResolvedValue([
        buildComponent(),
      ]);

      const [dataRow] = (await readBuffer(await service.export({}))).slice(2);

      expect(dataRow[6]).toBe(37); // Largo 40/50
      expect(dataRow[8]).toBe(37); // Largo 40
      expect(dataRow[10]).toBe(18); // Largo 20
    });

    it('includes the phantom item without components with columns M–T empty', async () => {
      phantomItems = [buildPhantomItem()];
      (componentRepository.find as jest.Mock).mockResolvedValue([]);

      const [dataRow] = (await readBuffer(await service.export({}))).slice(2);

      expect(dataRow[4]).toBe('500190');
      expect(dataRow[12]).toBeNull(); // ÍTEM - COMPONENTE
      expect(dataRow[19]).toBeNull(); // BODEGA CONSUMO
    });

    it('generates only headers when there are no phantom items', async () => {
      const rows = await readBuffer(await service.export({}));
      expect(rows).toHaveLength(2);
      expect(componentRepository.find).not.toHaveBeenCalled();
    });

    it('respects the lengths of a formula override', async () => {
      phantomItems = [
        buildPhantomItem({
          formulaOverrides: JSON.stringify({
            referenceLength: '=LARGO(shortDescription)',
          }),
        }),
      ];
      (componentRepository.find as jest.Mock).mockResolvedValue([
        buildComponent(),
      ]);

      const [dataRow] = (await readBuffer(await service.export({}))).slice(2);

      expect(dataRow[6]).toBe(18); // measures shortDescription, not reference
      expect(dataRow[8]).toBe(37); // itemDescriptionLength still measures itemDescription
    });
  });
});
