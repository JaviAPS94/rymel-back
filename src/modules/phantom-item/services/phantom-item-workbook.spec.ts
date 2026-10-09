import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { join } from 'path';
import { PhantomItemImportService } from './phantom-item-import.service';
import { PhantomItemService } from './phantom-item.service';
import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import { PhantomItemImportMode } from '../dtos/import-phantom-items.dto';
import { InMemoryProcessService } from '../testing/in-memory-process.service';
import { parseExtraValues } from '../utils/extra-values';

/**
 * The business's workbook, cut down: rows 1–2 of every sheet and the first
 * two phantom items of each, plus 500478 from ALISTAMIENTO Y ENCUBE, whose
 * PLAN/MAYOR were dragged and incremented in Excel, 500532, with two rows
 * below its last line that only carry «Fantasma», and 500558 from
 * METALMECANICA, with a 42-character reference. Values only, no formulas.
 * SEF-SEH is hidden, as in the original, and keeps only its two top rows.
 */
const WORKBOOK = join(__dirname, '../testing/__fixtures__/workbook-slice.xlsx');

describe('Phantom items: the business workbook', () => {
  let service: PhantomItemImportService;
  let processes: InMemoryProcessService;
  let savedHeaders: Partial<PhantomItem>[];
  let writtenComponents: Map<number, Partial<PhantomItemComponent>[]>;

  beforeEach(() => {
    savedHeaders = [];
    writtenComponents = new Map();
    let nextId = 1;

    const phantomItemRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const componentRepository = { find: jest.fn().mockResolvedValue([]) };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === PhantomItem
          ? {
              save: jest.fn(async (header: Partial<PhantomItem>) => {
                const saved = { ...header, id: nextId++ };
                savedHeaders.push(saved);
                return saved;
              }),
              update: jest.fn().mockResolvedValue({ affected: 1 }),
            }
          : {
              update: jest.fn().mockResolvedValue({ affected: 0 }),
              insert: jest.fn(async (rows: Partial<PhantomItemComponent>[]) => {
                rows.forEach((component) => {
                  const list =
                    writtenComponents.get(component.phantomItemId!) ?? [];
                  writtenComponents.set(component.phantomItemId!, [
                    ...list,
                    component,
                  ]);
                });
                return { identifiers: [] };
              }),
            },
      ),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      ),
    } as unknown as DataSource;

    processes = new InMemoryProcessService();
    const phantomItemService = new PhantomItemService(
      phantomItemRepository as unknown as Repository<PhantomItem>,
      componentRepository as unknown as Repository<PhantomItemComponent>,
      dataSource,
      processes.asService(),
    );
    service = new PhantomItemImportService(
      phantomItemRepository as unknown as Repository<PhantomItem>,
      phantomItemService,
      dataSource,
      processes.asService(),
    );
  });

  const headerOf = (itemCode: string) =>
    savedHeaders.find((header) => header.itemCode === itemCode)!;
  const linesOf = (itemCode: string) =>
    writtenComponents.get(headerOf(itemCode).id!) ?? [];

  it('reads every visible sheet into its own process, with its families', async () => {
    const result = await service.import(
      WORKBOOK,
      PhantomItemImportMode.CREATE,
      false,
    );

    expect(result.errors).toEqual([]);
    expect(result.created).toBe(13);
    // 500532's two rows below its last line carry only «Fantasma»: blank
    expect(result.rowsRead).toBe(85);
    expect(processes.processes.map((process) => process.name)).toEqual([
      'General',
      'EMBLEMADO',
      'ALISTAMIENTO Y ENCUBE',
      'CANASTILLAS',
      'METALMECANICA',
      'ARMADO Y CONEXIÓN',
    ]);
    expect(
      result.sheets.map((sheet) => [
        sheet.sheet,
        sheet.newProcess,
        sheet.created,
      ]),
    ).toEqual([
      ['SEF-SEH', false, 0],
      ['EMBLEMADO', true, 2],
      ['ALISTAMIENTO Y ENCUBE', true, 4],
      ['CANASTILLAS', true, 2],
      ['METALMECANICA', true, 3],
      ['ARMADO Y CONEXIÓN', true, 2],
    ]);

    const alistamiento = processes.processes[2];
    expect(headerOf('500414').processId).toBe(alistamiento.id);
    expect(alistamiento.families.map((family) => family.id)).toContain(
      headerOf('500414').familyId,
    );
  });

  it('skips the hidden sheet and says so', async () => {
    const result = await service.import(
      WORKBOOK,
      PhantomItemImportMode.CREATE,
      true,
    );

    expect(result.warnings).toContainEqual({
      sheet: 'SEF-SEH',
      row: 0,
      message: 'Hidden sheet: not imported.',
    });
    expect(result.sheets[0]).toMatchObject({
      sheet: 'SEF-SEH',
      hidden: true,
      phantomItemsDetected: 0,
    });
  });

  it('leaves «Estructura LM» and «Plantillas Diseño» out, reported as ignored', async () => {
    const result = await service.import(
      WORKBOOK,
      PhantomItemImportMode.CREATE,
      true,
    );

    expect(
      result.sheets.find((sheet) => sheet.sheet === 'EMBLEMADO')!
        .ignoredColumns,
    ).toEqual(['Estructura LM', 'Plantillas Diseño']);
  });

  it("takes the process's own header for a catalog field", async () => {
    await service.import(WORKBOOK, PhantomItemImportMode.CREATE, false);

    const emblemado = processes.processes[1];
    expect(
      emblemado.columns.find((column) => column.key === 'requiredQuantity')!
        .header,
    ).toBe('CANT. REQUERIDA LMS');
    expect(
      linesOf('500190').every(
        (line) => typeof line.requiredQuantity === 'number',
      ),
    ).toBe(true);
    const metalmecanica = processes.processes[4];
    expect(
      metalmecanica.columns.find((column) => column.key === 'wastePercentage')!
        .header,
    ).toBe('% DESP. LAMINA');
  });

  it("keeps PLAN/MAYOR as the phantom item's own header values", async () => {
    await service.import(WORKBOOK, PhantomItemImportMode.CREATE, false);

    expect(parseExtraValues(headerOf('500414').extraValues as string)).toEqual({
      'custom:plan1': '1 / CLASE DE ITEM',
      'custom:mayor1': 'FA / FANTASMA',
      'custom:plan2': '42 / GRUPOS DE FANTASMAS',
      'custom:mayor2': 'EEN / EQUIPO ENCUBADO',
    });
  });

  it('keeps the first row when PLAN/MAYOR were dragged and incremented in Excel, and warns', async () => {
    const result = await service.import(
      WORKBOOK,
      PhantomItemImportMode.CREATE,
      false,
    );

    expect(
      parseExtraValues(headerOf('500478').extraValues as string)[
        'custom:plan1'
      ],
    ).toBe('1 / CLASE DE ITEM');
    expect(
      result.warnings.some(
        (warning) =>
          warning.sheet === 'ALISTAMIENTO Y ENCUBE' &&
          warning.column === 'PLAN1',
      ),
    ).toBe(true);
    expect(linesOf('500478')).toHaveLength(15);
  });

  it('reads METALMECANICA by its «Item» with codes, not the duplicate with a label', async () => {
    const result = await service.import(
      WORKBOOK,
      PhantomItemImportMode.CREATE,
      false,
    );

    expect(
      result.sheets.find((sheet) => sheet.sheet === 'METALMECANICA')!
        .phantomItemsDetected,
    ).toBe(3);
    expect(linesOf('500388')).toHaveLength(3);
    expect(linesOf('500389')).toHaveLength(3);
  });

  it('proposes the new processes in a dry run without creating them', async () => {
    const result = await service.import(
      WORKBOOK,
      PhantomItemImportMode.CREATE,
      true,
    );

    expect(processes.processes).toHaveLength(1);
    expect(savedHeaders).toEqual([]);
    expect(result.sheets.filter((sheet) => sheet.newProcess)).toHaveLength(5);
    expect(result.phantomItemsDetected).toBe(13);
  });

  it("infers each new process's reference rule from its sheet", async () => {
    const result = await service.import(
      WORKBOOK,
      PhantomItemImportMode.CREATE,
      false,
    );

    expect(
      Object.fromEntries(
        result.sheets
          .filter((sheet) => !sheet.hidden)
          .map((sheet) => [sheet.sheet, sheet.referenceSeparator]),
      ),
    ).toEqual({
      EMBLEMADO: '',
      'ALISTAMIENTO Y ENCUBE': ' ',
      CANASTILLAS: ' ',
      METALMECANICA: ' ',
      'ARMADO Y CONEXIÓN': ' ',
    });
    expect(
      processes.processes.map((process) => process.referenceSeparator),
    ).toEqual(['', '', ' ', ' ', ' ', ' ']);
    // With the sheet's rule the references are calculated, not kept as literals
    expect(headerOf('500414').reference).toBe('F-1AU-EEN-KIT ALIS 0-75 KVA GT');
    expect(headerOf('500414').formulaOverrides).toBeNull();
    expect(
      result.warnings.filter(
        (warning) =>
          warning.sheet === 'ALISTAMIENTO Y ENCUBE' &&
          warning.column === 'Referencia',
      ),
    ).toEqual([]);
  });

  it('gives a 41–50 character reference the limit of 50, and accepts «Desc. item» over 40 with a warning', async () => {
    const result = await service.import(
      WORKBOOK,
      PhantomItemImportMode.CREATE,
      false,
    );

    expect(headerOf('500558')).toMatchObject({ referenceLengthLimit: 50 });
    expect(headerOf('500558').reference!.length).toBeGreaterThan(40);
    expect(headerOf('500388')).toMatchObject({ referenceLengthLimit: 40 });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        sheet: 'METALMECANICA',
        column: 'Desc. item',
        message: expect.stringMatching(/exceeds the limit of 40 .*Accepted\.$/),
      }),
    );
  });

  describe('pasting from Excel', () => {
    /** A new phantom item for ALISTAMIENTO Y ENCUBE, as rows copied from its sheet */
    const pastedRows = (columns: { key: string }[]) => {
      const header: Record<string, string> = {
        finishedProductType: '1CV',
        workInProcessType: 'EEN',
        phantomRootCode: 'KIT ALIS',
        kvaRatingStandard: ' 0-75 KVA GT',
        itemCode: '599001',
        unitOfMeasure: 'UND',
        'custom:plan1': '1 / CLASE DE ITEM',
      };
      return ['211', '3045'].map((componentItemCode) => {
        const values: Record<string, string> = {
          ...header,
          componentItemCode,
          baseQuantity: '1',
          requiredQuantity: '2',
        };
        return [
          'F. Acc Alis',
          ...columns.map((column) => values[column.key] ?? ''),
        ].join('\t');
      });
    };

    beforeEach(async () => {
      await service.import(WORKBOOK, PhantomItemImportMode.CREATE, false);
      savedHeaders.length = 0;
      writtenComponents.clear();
    });

    it("reads rows without a header in the process's column order, family first", async () => {
      const alistamiento = processes.processes[2];

      const result = await service.importPasted(
        alistamiento.id,
        pastedRows(alistamiento.columns).join('\n'),
        PhantomItemImportMode.CREATE,
        false,
      );

      expect(result.errors).toEqual([]);
      expect(result.created).toBe(1);
      expect(headerOf('599001')).toMatchObject({ processId: alistamiento.id });
      expect(
        parseExtraValues(headerOf('599001').extraValues as string)[
          'custom:plan1'
        ],
      ).toBe('1 / CLASE DE ITEM');
      expect(
        alistamiento.families.find(
          (family) => family.id === headerOf('599001').familyId,
        )!.name,
      ).toBe('F. Acc Alis');
      expect(linesOf('599001').map((line) => line.componentItemCode)).toEqual([
        '211',
        '3045',
      ]);
    });

    it('accepts the header row copied along with the data', async () => {
      const alistamiento = processes.processes[2];
      const headerRow = [
        'Fantasma',
        ...alistamiento.columns.map((column) => column.header),
      ].join('\t');

      const result = await service.importPasted(
        alistamiento.id,
        [headerRow, ...pastedRows(alistamiento.columns)].join('\r\n') + '\r\n',
        PhantomItemImportMode.CREATE,
        true,
      );

      expect(result.errors).toEqual([]);
      expect(result.rowsRead).toBe(2);
      expect(result.phantomItemsDetected).toBe(1);
    });

    it('rejects an empty paste', async () => {
      await expect(
        service.importPasted(
          processes.processes[2].id,
          '\n\t\n',
          PhantomItemImportMode.CREATE,
          true,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
