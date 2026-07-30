import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Element } from '../../element/entities/element.entity';
import { Design } from '../../design/entities/design.entity';
import { DesignCodePowerLetterService } from './design-code-power-letter.service';
import { DesignCodePrimaryTensionLetterService } from './design-code-primary-tension-letter.service';
import { DesignCodeSecondaryTensionLetterService } from './design-code-secondary-tension-letter.service';
import { DesignCodeSapSegmentMappingService } from './design-code-sap-segment-mapping.service';
import { DesignCodeSuffixFormatService } from './design-code-suffix-format.service';
import { DesignCodeSapSegmentName } from '../enums/design-code-sap-segment-name.enum';
import { DesignCodePhaseType } from '../enums/design-code-phase-type.enum';
import {
  DesignCodeSegmentDto,
  DesignCodeSegmentKey,
  GenerateDesignCodeDto,
} from '../dtos/generate-design-code.dto';
import { assembleDesignCode, buildSuffixToken } from './design-code-generation.util';

const MAX_DISAMBIGUATION_ATTEMPTS = 500;

// Marca visual usada en el segmento MO/material de devanado mientras el usuario
// no ha etiquetado la celda correspondiente en el diseño (código de vista previa).
const MISSING_SEGMENT_PLACEHOLDER = '??';

const SEGMENT_LABELS: Record<DesignCodeSegmentKey, string> = {
  [DesignCodeSegmentKey.FASE]: 'Fase',
  [DesignCodeSegmentKey.POTENCIA]: 'Potencia',
  [DesignCodeSegmentKey.TENSION_PRIMARIA]: 'Tensión primaria',
  [DesignCodeSegmentKey.TENSION_SECUNDARIA]: 'Tensión secundaria',
  [DesignCodeSegmentKey.ANIO]: 'Año',
  [DesignCodeSegmentKey.MO]: 'Material del núcleo',
  [DesignCodeSegmentKey.MATERIAL_DEVANADO]: 'Material de devanado',
  [DesignCodeSegmentKey.PAIS]: 'País',
  [DesignCodeSegmentKey.SUFIJO_FINAL]: 'Sufijo final',
};

export interface GeneratedDesignCode {
  code: string;
  isDuplicate: boolean;
  baseCode?: string;
  isComplete: boolean;
  moMissing: boolean;
  materialDevanadoMissing: boolean;
  segments: DesignCodeSegmentDto[];
  suffixPattern?: string;
}

@Injectable()
export class DesignCodeGenerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly powerLetterService: DesignCodePowerLetterService,
    private readonly primaryTensionLetterService: DesignCodePrimaryTensionLetterService,
    private readonly secondaryTensionLetterService: DesignCodeSecondaryTensionLetterService,
    private readonly sapSegmentMappingService: DesignCodeSapSegmentMappingService,
    private readonly suffixFormatService: DesignCodeSuffixFormatService,
  ) {}

  async generate(dto: GenerateDesignCodeDto): Promise<GeneratedDesignCode> {
    const moMissing = !dto.moValue?.trim();
    const materialDevanadoMissing = !dto.materialDevanadoValue?.trim();

    const element = await this.dataSource
      .getRepository(Element)
      .findOne({ where: { id: dto.elementId, deletedAt: IsNull() } });

    if (!element) {
      throw new NotFoundException('Element not found');
    }
    if (!element.sapReference?.trim()) {
      throw new BadRequestException(
        'El elemento seleccionado no tiene una referencia SAP configurada',
      );
    }

    const segments = element.sapReference.split('-');
    const indexMap = await this.sapSegmentMappingService.getIndexMap();

    const getSegment = (name: DesignCodeSapSegmentName): string => {
      const index = indexMap[name];
      if (index === undefined) {
        throw new BadRequestException(
          `Falta configurar la posición del segmento "${name}" en el mapeo de segmentos SAP`,
        );
      }
      if (index >= segments.length) {
        throw new BadRequestException(
          'La referencia SAP del elemento no tiene el formato esperado',
        );
      }
      return segments[index];
    };

    const phase = getSegment(DesignCodeSapSegmentName.FASE);
    const powerRaw = getSegment(DesignCodeSapSegmentName.POTENCIA);
    const primaryTensionRaw = getSegment(
      DesignCodeSapSegmentName.TENSION_PRIMARIA,
    );
    const secondaryTensionRaw = getSegment(
      DesignCodeSapSegmentName.TENSION_SECUNDARIA,
    );
    const finalSegment = getSegment(DesignCodeSapSegmentName.SUFIJO_FINAL);
    const countryCode = getSegment(DesignCodeSapSegmentName.PAIS_CODE);

    const phaseType =
      phase === '1' ? DesignCodePhaseType.MONOFASICA : DesignCodePhaseType.TRIFASICA;

    const powerLetter = await this.findPowerLetter(phaseType, powerRaw);
    const primaryTensionLetter = await this.findPrimaryTensionLetter(
      primaryTensionRaw,
    );
    const secondaryTensionLetter = await this.findSecondaryTensionLetter(
      secondaryTensionRaw,
    );

    const year = String(new Date().getFullYear()).slice(-2);
    const moToken = moMissing
      ? MISSING_SEGMENT_PLACEHOLDER
      : dto.moValue!.trim();
    const materialToken = materialDevanadoMissing
      ? MISSING_SEGMENT_PLACEHOLDER
      : dto.materialDevanadoValue!.trim();

    const buildSegments = (
      yearValue: string,
      moValue: string,
      materialValue: string,
    ): DesignCodeSegmentDto[] => [
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.FASE,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.FASE],
        value: phase,
        isMissing: false,
      }),
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.POTENCIA,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.POTENCIA],
        value: powerLetter,
        isMissing: false,
      }),
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.TENSION_PRIMARIA,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.TENSION_PRIMARIA],
        value: primaryTensionLetter,
        isMissing: false,
      }),
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.TENSION_SECUNDARIA,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.TENSION_SECUNDARIA],
        value: secondaryTensionLetter,
        isMissing: false,
      }),
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.ANIO,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.ANIO],
        value: yearValue,
        isMissing: false,
      }),
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.MO,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.MO],
        value: moValue,
        isMissing: moMissing,
      }),
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.MATERIAL_DEVANADO,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.MATERIAL_DEVANADO],
        value: materialValue,
        isMissing: materialDevanadoMissing,
      }),
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.PAIS,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.PAIS],
        value: countryCode,
        isMissing: false,
      }),
      new DesignCodeSegmentDto({
        key: DesignCodeSegmentKey.SUFIJO_FINAL,
        label: SEGMENT_LABELS[DesignCodeSegmentKey.SUFIJO_FINAL],
        value: finalSegment,
        isMissing: false,
      }),
    ];

    const baseCode = assembleDesignCode({
      phase,
      powerLetter,
      primaryTensionLetter,
      secondaryTensionLetter,
      year,
      moValue: moToken,
      materialDevanadoValue: materialToken,
      countryCode,
      finalSegment,
    });

    // Mientras falte etiquetar MO o material de devanado, el código es solo una
    // vista previa: no tiene sentido verificar duplicados ni resolver un sufijo
    // de desambiguación contra un código que todavía tiene segmentos placeholder.
    if (moMissing || materialDevanadoMissing) {
      return {
        code: baseCode,
        isDuplicate: false,
        isComplete: false,
        moMissing,
        materialDevanadoMissing,
        segments: buildSegments(year, moToken, materialToken),
      };
    }

    const designRepo = this.dataSource.getRepository(Design);
    const existing = await designRepo.findOne({
      where: { code: baseCode, deletedAt: IsNull() },
    });

    if (!existing) {
      return {
        code: baseCode,
        isDuplicate: false,
        isComplete: true,
        moMissing: false,
        materialDevanadoMissing: false,
        segments: buildSegments(year, moToken, materialToken),
      };
    }

    const defaultFormat = await this.suffixFormatService.getDefault();
    if (!defaultFormat) {
      throw new InternalServerErrorException(
        'No hay un formato de sufijo de desambiguación predeterminado configurado',
      );
    }

    for (let attempt = 1; attempt <= MAX_DISAMBIGUATION_ATTEMPTS; attempt++) {
      const disambiguationToken = buildSuffixToken(
        defaultFormat.pattern,
        attempt,
      );
      const candidateCode = assembleDesignCode({
        phase,
        powerLetter,
        primaryTensionLetter,
        secondaryTensionLetter,
        year,
        disambiguationToken,
        moValue: moToken,
        materialDevanadoValue: materialToken,
        countryCode,
        finalSegment,
      });

      const candidateExists = await designRepo.findOne({
        where: { code: candidateCode, deletedAt: IsNull() },
      });

      if (!candidateExists) {
        return {
          code: candidateCode,
          isDuplicate: true,
          baseCode,
          isComplete: true,
          moMissing: false,
          materialDevanadoMissing: false,
          suffixPattern: defaultFormat.pattern,
          segments: buildSegments(
            `${year}${disambiguationToken}`,
            moToken,
            materialToken,
          ),
        };
      }
    }

    throw new InternalServerErrorException(
      'No fue posible generar un código de diseño único',
    );
  }

  private async findPowerLetter(
    phaseType: DesignCodePhaseType,
    powerRaw: string,
  ): Promise<string> {
    const powerKva = Number(powerRaw);
    const rows = await this.powerLetterService.findAll();
    const match = rows.find(
      (row) =>
        row.phaseType === phaseType &&
        powerKva >= Number(row.powerKvaMin) &&
        powerKva <= Number(row.powerKvaMax),
    );
    if (!match) {
      throw new BadRequestException(
        `No existe una letra de potencia configurada para ${powerRaw} kVA (${phaseType})`,
      );
    }
    return match.letter;
  }

  private async findPrimaryTensionLetter(
    tensionRaw: string,
  ): Promise<string> {
    const tensionValue = Number(tensionRaw);
    const rows = await this.primaryTensionLetterService.findAll();
    const match = rows.find(
      (row) =>
        tensionValue >= Number(row.tensionValueMin) &&
        tensionValue <= Number(row.tensionValueMax),
    );
    if (!match) {
      throw new BadRequestException(
        `No existe una letra de tensión primaria configurada para ${tensionRaw}`,
      );
    }
    return match.letter;
  }

  private async findSecondaryTensionLetter(
    tensionRaw: string,
  ): Promise<string> {
    const tensionValue = Number(tensionRaw);
    const rows = await this.secondaryTensionLetterService.findAll();
    const match = rows.find(
      (row) =>
        tensionValue >= Number(row.tensionValueMin) &&
        tensionValue <= Number(row.tensionValueMax),
    );
    if (!match) {
      throw new BadRequestException(
        `No existe una letra de tensión secundaria configurada para ${tensionRaw}`,
      );
    }
    return match.letter;
  }

  async isCodeAvailable(code: string): Promise<boolean> {
    const existing = await this.dataSource
      .getRepository(Design)
      .findOne({ where: { code, deletedAt: IsNull() } });
    return !existing;
  }
}
