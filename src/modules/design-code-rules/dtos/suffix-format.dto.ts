import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { DesignCodeSuffixPattern } from '../enums/design-code-suffix-pattern.enum';

export class CreateSuffixFormatDto {
  @ApiProperty({ enum: DesignCodeSuffixPattern })
  @IsEnum(DesignCodeSuffixPattern)
  pattern: DesignCodeSuffixPattern;

  @ApiProperty({ example: 'Letra pegada al año (ej. 26A, 26B)' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateSuffixFormatDto {
  @ApiProperty({ enum: DesignCodeSuffixPattern, required: false })
  @IsOptional()
  @IsEnum(DesignCodeSuffixPattern)
  pattern?: DesignCodeSuffixPattern;

  @ApiProperty({ example: 'Letra pegada al año (ej. 26A, 26B)', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
