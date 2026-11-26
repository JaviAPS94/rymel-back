import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class AddNodePhantomFamiliesDto {
  @ApiProperty({ example: [3, 7] })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  familyIds: number[];
}

export class SetBomProductTypesDto {
  @ApiProperty({ example: ['1CA', '3CATC'] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  codes: string[];
}
