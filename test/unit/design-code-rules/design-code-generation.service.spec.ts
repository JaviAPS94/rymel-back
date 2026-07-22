import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DesignCodeGenerationService } from '../../../src/modules/design-code-rules/services/design-code-generation.service';
import { DesignCodePhaseType } from '../../../src/modules/design-code-rules/enums/design-code-phase-type.enum';
import { DesignCodeSapSegmentName } from '../../../src/modules/design-code-rules/enums/design-code-sap-segment-name.enum';
import { DesignCodeSuffixPattern } from '../../../src/modules/design-code-rules/enums/design-code-suffix-pattern.enum';
import { GenerateDesignCodeDto } from '../../../src/modules/design-code-rules/dtos/generate-design-code.dto';

describe('DesignCodeGenerationService', () => {
  const currentYearSuffix = String(new Date().getFullYear()).slice(-2);

  const defaultSegmentMapping = {
    [DesignCodeSapSegmentName.FASE]: 0,
    [DesignCodeSapSegmentName.POTENCIA]: 1,
    [DesignCodeSapSegmentName.TENSION_PRIMARIA]: 2,
    [DesignCodeSapSegmentName.TENSION_SECUNDARIA]: 3,
    [DesignCodeSapSegmentName.SUFIJO_FINAL]: 4,
    [DesignCodeSapSegmentName.PAIS_CODE]: 7,
  };

  const powerLetterRows = [
    { phaseType: DesignCodePhaseType.MONOFASICA, powerKva: 25, letter: 'D' },
  ];
  const primaryTensionRows = [{ tensionValue: 220, letter: 'A' }];
  const secondaryTensionRows = [{ tensionValue: 120, letter: 'A' }];

  let elementRepo: { findOne: jest.Mock };
  let designRepo: { findOne: jest.Mock };
  let dataSource: DataSource;
  let powerLetterService: any;
  let primaryTensionLetterService: any;
  let secondaryTensionLetterService: any;
  let sapSegmentMappingService: any;
  let suffixFormatService: any;
  let service: DesignCodeGenerationService;

  const validDto: GenerateDesignCodeDto = {
    elementId: 1,
    moValue: 'MO',
    materialDevanadoValue: 'AL',
  };

  beforeEach(() => {
    elementRepo = { findOne: jest.fn() };
    designRepo = { findOne: jest.fn() };

    dataSource = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity?.name === 'Element') return elementRepo;
        if (entity?.name === 'Design') return designRepo;
        throw new Error(`Unexpected repository requested: ${entity?.name}`);
      }),
    } as unknown as DataSource;

    powerLetterService = { findAll: jest.fn().mockResolvedValue(powerLetterRows) };
    primaryTensionLetterService = {
      findAll: jest.fn().mockResolvedValue(primaryTensionRows),
    };
    secondaryTensionLetterService = {
      findAll: jest.fn().mockResolvedValue(secondaryTensionRows),
    };
    sapSegmentMappingService = {
      getIndexMap: jest.fn().mockResolvedValue(defaultSegmentMapping),
    };
    suffixFormatService = {
      getDefault: jest.fn().mockResolvedValue({
        pattern: DesignCodeSuffixPattern.LETTER_SUFFIX,
      }),
    };

    service = new DesignCodeGenerationService(
      dataSource,
      powerLetterService,
      primaryTensionLetterService,
      secondaryTensionLetterService,
      sapSegmentMappingService,
      suffixFormatService,
    );

    elementRepo.findOne.mockResolvedValue({
      id: 1,
      sapReference: '1-25-220-120-CV-CTY-NTCA-CO-ST',
    });
  });

  it('generates the code from the design-code-generation spec example', async () => {
    designRepo.findOne.mockResolvedValue(null);

    const result = await service.generate(validDto);

    expect(result).toEqual({
      code: `1DAA${currentYearSuffix}MOAL-CO CV`,
      isDuplicate: false,
      isComplete: true,
      moMissing: false,
      materialDevanadoMissing: false,
    });
  });

  it('rejects when the element does not exist', async () => {
    elementRepo.findOne.mockResolvedValue(null);

    await expect(service.generate(validDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects when the element has no SAP reference', async () => {
    elementRepo.findOne.mockResolvedValue({ id: 1, sapReference: null });

    await expect(service.generate(validDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns an incomplete preview with a placeholder when moValue is missing', async () => {
    const result = await service.generate({ ...validDto, moValue: '  ' });

    expect(result).toEqual({
      code: `1DAA${currentYearSuffix}??AL-CO CV`,
      isDuplicate: false,
      isComplete: false,
      moMissing: true,
      materialDevanadoMissing: false,
    });
    // No debe consultar duplicados mientras el código es solo una vista previa
    expect(designRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns an incomplete preview with a placeholder when materialDevanadoValue is missing', async () => {
    const result = await service.generate({
      ...validDto,
      materialDevanadoValue: '',
    });

    expect(result).toEqual({
      code: `1DAA${currentYearSuffix}MO??-CO CV`,
      isDuplicate: false,
      isComplete: false,
      moMissing: false,
      materialDevanadoMissing: true,
    });
    expect(designRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects when there is no power letter configured for the SAP power segment', async () => {
    powerLetterService.findAll.mockResolvedValue([]);
    designRepo.findOne.mockResolvedValue(null);

    await expect(service.generate(validDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when the SAP reference has fewer segments than the configured mapping expects', async () => {
    elementRepo.findOne.mockResolvedValue({
      id: 1,
      sapReference: '1-25-220-120',
    });

    await expect(service.generate(validDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('appends the default disambiguation suffix when the base code already exists', async () => {
    designRepo.findOne
      .mockResolvedValueOnce({ id: 99, code: `1DAA${currentYearSuffix}MOAL-CO CV` }) // base code exists
      .mockResolvedValueOnce(null); // first alternative (suffix "A") is free

    const result = await service.generate(validDto);

    expect(result).toEqual({
      code: `1DAA${currentYearSuffix}AMOAL-CO CV`,
      isDuplicate: true,
      baseCode: `1DAA${currentYearSuffix}MOAL-CO CV`,
      isComplete: true,
      moMissing: false,
      materialDevanadoMissing: false,
    });
  });
});
