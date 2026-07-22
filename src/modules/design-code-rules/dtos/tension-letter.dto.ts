import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, Length } from 'class-validator';

export class CreateTensionLetterDto {
  @ApiProperty({ example: 220 })
  @IsNumber()
  tensionValue: number;

  @ApiProperty({ example: 'A' })
  @IsNotEmpty()
  @Length(1, 1)
  letter: string;
}

export class UpdateTensionLetterDto {
  @ApiProperty({ example: 220, required: false })
  @IsOptional()
  @IsNumber()
  tensionValue?: number;

  @ApiProperty({ example: 'A', required: false })
  @IsOptional()
  @Length(1, 1)
  letter?: string;
}
