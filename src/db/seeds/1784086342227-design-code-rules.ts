import { DesignCodePowerLetter } from 'src/modules/design-code-rules/entities/design-code-power-letter.entity';
import { DesignCodePrimaryTensionLetter } from 'src/modules/design-code-rules/entities/design-code-primary-tension-letter.entity';
import { DesignCodeSecondaryTensionLetter } from 'src/modules/design-code-rules/entities/design-code-secondary-tension-letter.entity';
import { DesignCodeSapSegmentMapping } from 'src/modules/design-code-rules/entities/design-code-sap-segment-mapping.entity';
import { DesignCodeSuffixFormat } from 'src/modules/design-code-rules/entities/design-code-suffix-format.entity';
import { DesignCodePhaseType } from 'src/modules/design-code-rules/enums/design-code-phase-type.enum';
import { DesignCodeSapSegmentName } from 'src/modules/design-code-rules/enums/design-code-sap-segment-name.enum';
import { DesignCodeSuffixPattern } from 'src/modules/design-code-rules/enums/design-code-suffix-pattern.enum';
import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';

export class DesignCodeRules1784086342227 implements Seeder {
  track = false;

  public async run(dataSource: DataSource): Promise<any> {
    const powerLetterRepo = dataSource.getRepository(DesignCodePowerLetter);
    const primaryTensionRepo = dataSource.getRepository(
      DesignCodePrimaryTensionLetter,
    );
    const secondaryTensionRepo = dataSource.getRepository(
      DesignCodeSecondaryTensionLetter,
    );
    const segmentMappingRepo = dataSource.getRepository(
      DesignCodeSapSegmentMapping,
    );
    const suffixFormatRepo = dataSource.getRepository(DesignCodeSuffixFormat);

    await powerLetterRepo.delete({});
    await primaryTensionRepo.delete({});
    await secondaryTensionRepo.delete({});
    await segmentMappingRepo.delete({});
    await suffixFormatRepo.delete({});

    const monofasica: Array<[string, number]> = [
      ['A', 5],
      ['B', 10],
      ['C', 15],
      ['D', 25],
      ['E', 37.5],
      ['F', 50],
      ['G', 75],
      ['H', 100],
      ['I', 133],
      ['J', 167],
      ['K', 250],
      ['L', 333],
      ['M', 500],
    ];

    const trifasica: Array<[string, number]> = [
      ['A', 15],
      ['B', 30],
      ['C', 45],
      ['D', 75],
      ['E', 112.5],
      ['F', 150],
      ['G', 225],
      ['H', 300],
      ['I', 400],
      ['J', 500],
      ['K', 630],
      ['L', 750],
      ['M', 1000],
      ['N', 160],
      ['Ñ', 2000],
      ['O', 2500],
      ['P', 3000],
      ['Q', 50],
      ['R', 100],
      ['S', 800],
      ['T', 125],
      ['U', 1250],
      ['V', 1600],
      ['W', 200],
      ['X', 250],
      ['Y', 1500],
    ];

    // Rango degenerado (min = max = valor histórico) hasta que se ajusten los
    // rangos reales de negocio desde project-admin.
    await powerLetterRepo.insert([
      ...monofasica.map(([letter, powerKva]) => ({
        phaseType: DesignCodePhaseType.MONOFASICA,
        powerKvaMin: powerKva,
        powerKvaMax: powerKva,
        letter,
      })),
      ...trifasica.map(([letter, powerKva]) => ({
        phaseType: DesignCodePhaseType.TRIFASICA,
        powerKvaMin: powerKva,
        powerKvaMax: powerKva,
        letter,
      })),
    ]);

    const primaryTension: Array<[string, number]> = [
      ['A', 220],
      ['B', 110],
      ['C', 440],
      ['D', 24940],
      ['E', 2400],
      ['F', 12700],
      ['G', 4160],
      ['H', 6000],
      ['I', 7620],
      ['J', 480],
      ['K', 10000],
      ['L', 6900],
      ['M', 11400],
      ['N', 13800],
      ['Ñ', 11950],
      ['O', 13200],
      ['P', 7960],
      ['Q', 19920],
      ['R', 19100],
      ['S', 22000],
      ['T', 7200],
      ['U', 33000],
      ['V', 22860],
      ['W', 34500],
      ['X', 22900],
      ['Y', 44000],
      ['Z', 14400],
    ];

    await primaryTensionRepo.insert(
      primaryTension.map(([letter, tensionValue]) => ({
        tensionValueMin: tensionValue,
        tensionValueMax: tensionValue,
        letter,
      })),
    );

    const secondaryTension: Array<[string, number]> = [
      ['A', 120],
      ['B', 231],
      ['C', 214],
      ['D', 208],
      ['E', 228],
      ['F', 225],
      ['G', 240],
      ['H', 400],
      ['I', 440],
      ['J', 220],
      ['K', 2400],
      ['L', 480],
      ['M', 4160],
      ['N', 450],
      ['Ñ', 456],
      ['O', 7620],
      ['P', 494],
      ['Q', 13200],
      ['R', 380],
      ['S', 13800],
      ['T', 6900],
      ['U', 216],
      ['V', 246],
      ['W', 277],
      ['X', 230],
      ['Y', 460],
      ['Z', 210],
    ];

    await secondaryTensionRepo.insert(
      secondaryTension.map(([letter, tensionValue]) => ({
        tensionValueMin: tensionValue,
        tensionValueMax: tensionValue,
        letter,
      })),
    );

    // Índices (0-based, tras `sapReference.split('-')`) inferidos del ejemplo
    // "1-25-220-120-CV-CTY-NTCA-CO-ST" -> 1DAA26MOAL-CO CV
    await segmentMappingRepo.insert([
      { segmentName: DesignCodeSapSegmentName.FASE, segmentIndex: 0 },
      { segmentName: DesignCodeSapSegmentName.POTENCIA, segmentIndex: 1 },
      {
        segmentName: DesignCodeSapSegmentName.TENSION_PRIMARIA,
        segmentIndex: 2,
      },
      {
        segmentName: DesignCodeSapSegmentName.TENSION_SECUNDARIA,
        segmentIndex: 3,
      },
      { segmentName: DesignCodeSapSegmentName.SUFIJO_FINAL, segmentIndex: 4 },
      { segmentName: DesignCodeSapSegmentName.PAIS_CODE, segmentIndex: 7 },
    ]);

    await suffixFormatRepo.insert([
      {
        pattern: DesignCodeSuffixPattern.LETTER_SUFFIX,
        label: 'Letra pegada al año (ej. 26A, 26B)',
        isDefault: true,
      },
      {
        pattern: DesignCodeSuffixPattern.LETTER_SUFFIX_DASH,
        label: 'Letra con guion (ej. 26-A, 26-B)',
        isDefault: false,
      },
      {
        pattern: DesignCodeSuffixPattern.NUMERIC_SUFFIX,
        label: 'Número pegado al año (ej. 261, 262)',
        isDefault: false,
      },
      {
        pattern: DesignCodeSuffixPattern.NUMERIC_SUFFIX_DASH,
        label: 'Número con guion (ej. 26-1, 26-2)',
        isDefault: false,
      },
    ]);
  }
}
