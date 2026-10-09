import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PhantomColumnScope } from '../entities/phantom-process-column.entity';

export class PhantomProcessNameDto {
  @ApiProperty({ example: 'METALMECANICA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class PhantomProcessReferenceSeparatorDto {
  @ApiProperty({
    example: ' ',
    enum: ['', ' '],
    description:
      'What goes between «Raiz Fantasma» and «R kVA + Norma / Otros» in the reference',
  })
  @IsIn(['', ' '])
  referenceSeparator: string;
}

export class PhantomProcessOrderDto {
  @ApiProperty({
    example: [3, 1, 2],
    description: 'Every active process, in the new order',
  })
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

export class PhantomProcessColumnDto {
  @ApiProperty({
    example: 'requiredQuantity',
    description:
      "A catalog field, or `custom:<key>` for one of the process's own text columns",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @ApiProperty({ example: 'CANT. REQUERIDA LMS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  header: string;

  @ApiProperty({
    enum: PhantomColumnScope,
    description: 'Only used by own columns',
  })
  @IsEnum(PhantomColumnScope)
  scope: PhantomColumnScope;
}

export class PhantomProcessColumnsDto {
  @ApiProperty({ type: [PhantomProcessColumnDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PhantomProcessColumnDto)
  columns: PhantomProcessColumnDto[];
}
