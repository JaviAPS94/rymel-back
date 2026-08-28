import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FormulaMap } from '../utils/derived-fields';

export class CreatePhantomItemComponentDto {
  @ApiProperty({ example: '4789', description: 'SAP code of the material' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  componentItemCode: string;

  @ApiPropertyOptional({ example: 'PAPEL TIPO INGENIERIA AZUL REF 3275' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  baseQuantity: number;

  @ApiProperty({ example: 9.87 })
  @IsNumber()
  requiredQuantity: number;

  @ApiPropertyOptional({
    example: 0.0987,
    description:
      'Derived. Only respected if the record brings its own formula for this field.',
  })
  @IsOptional()
  @IsNumber()
  requiredQuantityPerUnit?: number;

  @ApiPropertyOptional({ example: 'MTS' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  componentUnitOfMeasure?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Fraction, not percentage: 0% is sent as 0',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  wastePercentage?: number;

  @ApiPropertyOptional({ example: 'PI01' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  consumptionWarehouse?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    example: { requiredQuantityPerUnit: '=P3/O3' },
    description: 'Formulas that override the default rules',
  })
  @IsOptional()
  @IsObject()
  formulaOverrides?: FormulaMap;
}

export class UpdatePhantomItemComponentDto extends PartialType(
  CreatePhantomItemComponentDto,
) {}
