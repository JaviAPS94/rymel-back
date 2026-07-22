import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class GenerateDesignCodeDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  elementId: number;

  @ApiProperty({
    example: 'MO',
    required: false,
    description:
      'Valor de la celda etiquetada como "MO". Si se omite, el código se genera con un placeholder en ese segmento y `isComplete` viene en false.',
  })
  @IsOptional()
  @IsString()
  moValue?: string;

  @ApiProperty({
    example: 'AL',
    required: false,
    description:
      'Valor de la celda etiquetada como "MD" (material de devanado). Si se omite, el código se genera con un placeholder en ese segmento y `isComplete` viene en false.',
  })
  @IsOptional()
  @IsString()
  materialDevanadoValue?: string;
}

export class DesignCodeGenerationResponseDto {
  @ApiProperty({ example: '1DAA26MOAL-CO CV' })
  code: string;

  @ApiProperty({ example: false })
  isDuplicate: boolean;

  @ApiProperty({ example: '1DAA26MOAL-CO CV', required: false })
  baseCode?: string;

  @ApiProperty({
    example: true,
    description:
      'false mientras falte etiquetar la celda MO y/o MD (código de vista previa, no verificado contra duplicados)',
  })
  isComplete: boolean;

  @ApiProperty({ example: false })
  moMissing: boolean;

  @ApiProperty({ example: false })
  materialDevanadoMissing: boolean;

  constructor(partial: Partial<DesignCodeGenerationResponseDto>) {
    Object.assign(this, partial);
  }
}
