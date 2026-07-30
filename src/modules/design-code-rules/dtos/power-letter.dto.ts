import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, Length } from 'class-validator';
import { DesignCodePhaseType } from '../enums/design-code-phase-type.enum';

export class CreatePowerLetterDto {
  @ApiProperty({ enum: DesignCodePhaseType })
  @IsEnum(DesignCodePhaseType)
  phaseType: DesignCodePhaseType;

  @ApiProperty({ example: 20 })
  @IsNumber()
  powerKvaMin: number;

  @ApiProperty({ example: 30 })
  @IsNumber()
  powerKvaMax: number;

  @ApiProperty({ example: 'D' })
  @IsNotEmpty()
  @Length(1, 1)
  letter: string;
}

export class UpdatePowerLetterDto {
  @ApiProperty({ enum: DesignCodePhaseType, required: false })
  @IsOptional()
  @IsEnum(DesignCodePhaseType)
  phaseType?: DesignCodePhaseType;

  @ApiProperty({ example: 20, required: false })
  @IsOptional()
  @IsNumber()
  powerKvaMin?: number;

  @ApiProperty({ example: 30, required: false })
  @IsOptional()
  @IsNumber()
  powerKvaMax?: number;

  @ApiProperty({ example: 'D', required: false })
  @IsOptional()
  @Length(1, 1)
  letter?: string;
}
