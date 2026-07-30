import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, Length } from 'class-validator';

export class CreateTensionLetterDto {
  @ApiProperty({ example: 210 })
  @IsNumber()
  tensionValueMin: number;

  @ApiProperty({ example: 230 })
  @IsNumber()
  tensionValueMax: number;

  @ApiProperty({ example: 'A' })
  @IsNotEmpty()
  @Length(1, 1)
  letter: string;
}

export class UpdateTensionLetterDto {
  @ApiProperty({ example: 210, required: false })
  @IsOptional()
  @IsNumber()
  tensionValueMin?: number;

  @ApiProperty({ example: 230, required: false })
  @IsOptional()
  @IsNumber()
  tensionValueMax?: number;

  @ApiProperty({ example: 'A', required: false })
  @IsOptional()
  @Length(1, 1)
  letter?: string;
}
