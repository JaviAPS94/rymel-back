import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FormulaMap } from '../utils/derived-fields';

export class PhantomItemComponentOutputDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ example: '4789' })
  componentItemCode: string;

  @ApiPropertyOptional({ example: 'PAPEL TIPO INGENIERIA AZUL REF 3275' })
  description: string;

  @ApiProperty({ example: 100 })
  baseQuantity: number;

  @ApiProperty({ example: 9.87 })
  requiredQuantity: number;

  @ApiPropertyOptional({ example: 0.0987 })
  requiredQuantityPerUnit: number;

  @ApiPropertyOptional({ example: 'MTS' })
  componentUnitOfMeasure: string;

  @ApiPropertyOptional({ example: 0 })
  wastePercentage: number;

  @ApiPropertyOptional({ example: 'PI01' })
  consumptionWarehouse: string;

  @ApiProperty({ example: { requiredQuantityPerUnit: '=P3/O3' } })
  formulaOverrides: FormulaMap;

  @ApiProperty({ example: { 'custom:lote': 'L-12' } })
  extraValues: Record<string, string>;
}

export class PhantomItemOutputDto {
  @ApiProperty({ example: 2 })
  processId: number;

  @ApiProperty({ example: 5, nullable: true })
  familyId: number | null;

  @ApiProperty({ example: 'F. Acc Sol', nullable: true })
  familyName: string | null;

  @ApiProperty({ example: { 'custom:plan1': '1 / CLASE DE ITEM' } })
  extraValues: Record<string, string>;

  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '1CA' })
  finishedProductType: string;

  @ApiProperty({ example: 'TPI' })
  workInProcessType: string;

  @ApiProperty({ example: 'KIT EMBLE' })
  phantomRootCode: string;

  @ApiPropertyOptional({ example: '-GY-GENERICO-AD-AZ' })
  kvaRatingStandard: string;

  @ApiProperty({ example: '500190' })
  itemCode: string;

  @ApiProperty({ example: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ' })
  reference: string;

  @ApiProperty({ example: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ' })
  itemDescription: string;

  @ApiProperty({ example: 'FANTASMA KIT EMBLE' })
  shortDescription: string;

  @ApiPropertyOptional({ example: 'UND' })
  unitOfMeasure: string;

  @ApiProperty({ example: 40, description: 'Limit applied to referenceLength' })
  referenceLengthLimit: number;

  @ApiProperty({ example: 37, description: 'Calculated, not stored' })
  referenceLength: number;

  @ApiProperty({ example: 37, description: 'Calculated, not stored' })
  itemDescriptionLength: number;

  @ApiProperty({ example: 18, description: 'Calculated, not stored' })
  shortDescriptionLength: number;

  @ApiProperty({
    example: {
      referenceLength: '=LARGO(reference)',
      itemDescriptionLength: '=LARGO(itemDescription)',
      shortDescriptionLength: '=LARGO(shortDescription)',
    },
    description:
      "Record's effective formulas: its own, filled in with the defaults",
  })
  formulaOverrides: FormulaMap;

  @ApiProperty({ example: 5 })
  componentsCount: number;
}

export class PhantomItemDetailOutputDto extends PhantomItemOutputDto {
  @ApiProperty({ type: [PhantomItemComponentOutputDto] })
  components: PhantomItemComponentOutputDto[];
}

export class PhantomItemListOutputDto {
  @ApiProperty({ type: [PhantomItemOutputDto] })
  data: PhantomItemOutputDto[];

  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;
}
