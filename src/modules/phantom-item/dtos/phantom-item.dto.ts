import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreatePhantomItemComponentDto } from './phantom-item-component.dto';
import { FormulaMap } from '../utils/derived-fields';
import { ALLOWED_REFERENCE_LIMITS } from '../constants/phantom-item-columns';

export class CreatePhantomItemDto {
  @ApiPropertyOptional({
    example: 2,
    description: 'Process of the phantom item. Defaults to the first process.',
  })
  @IsOptional()
  @IsInt()
  processId?: number;

  @ApiPropertyOptional({
    example: 5,
    nullable: true,
    description: 'Family within the process. null removes it.',
  })
  @IsOptional()
  @IsInt()
  familyId?: number | null;

  @ApiPropertyOptional({
    example: 'F. Acc Sol',
    description:
      'Family by name: found or created in the process. Wins over familyId.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  familyName?: string;

  @ApiPropertyOptional({
    example: { 'custom:plan1': '1 / CLASE DE ITEM' },
    description: "Values of the process's own header columns",
  })
  @IsOptional()
  @IsObject()
  extraValues?: Record<string, string>;

  @ApiProperty({ example: '1CA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  finishedProductType: string;

  @ApiProperty({ example: 'TPI' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  workInProcessType: string;

  @ApiProperty({ example: 'KIT EMBLE' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  phantomRootCode: string;

  @ApiPropertyOptional({
    example: '-GY-GENERICO-AD-AZ',
    description:
      'Includes its own leading separator (hyphen or space), exactly as in the template',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  kvaRatingStandard?: string;

  @ApiProperty({ example: '500190', description: 'SAP code of the header' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  itemCode: string;

  @ApiPropertyOptional({
    example: 'F-1CA-TPI-KIT EMBLE-GY-GENERICO-AD-AZ',
    description: 'Derived. Only respected if there is an own formula.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;

  @ApiPropertyOptional({ description: 'Derived. Only with an own formula.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  itemDescription?: string;

  @ApiPropertyOptional({
    example: 'FANTASMA KIT EMBLE',
    description: 'Derived. Only with an own formula.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortDescription?: string;

  @ApiPropertyOptional({ example: 'UND' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;

  @ApiPropertyOptional({
    example: 40,
    description: 'Limit applied to Largo 40/50. Only 40 or 50.',
  })
  @IsOptional()
  @IsIn(ALLOWED_REFERENCE_LIMITS)
  referenceLengthLimit?: number;

  @ApiPropertyOptional({
    example: { referenceLength: '=LARGO(reference)' },
    description: 'Formulas that override the default rules',
  })
  @IsOptional()
  @IsObject()
  formulaOverrides?: FormulaMap;

  @ApiPropertyOptional({ type: [CreatePhantomItemComponentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CreatePhantomItemComponentDto)
  components?: CreatePhantomItemComponentDto[];
}

export class UpdatePhantomItemDto extends PartialType(CreatePhantomItemDto) {}
