import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export enum DesignCodeSegmentKey {
  FASE = 'FASE',
  POTENCIA = 'POTENCIA',
  TENSION_PRIMARIA = 'TENSION_PRIMARIA',
  TENSION_SECUNDARIA = 'TENSION_SECUNDARIA',
  ANIO = 'ANIO',
  MO = 'MO',
  MATERIAL_DEVANADO = 'MATERIAL_DEVANADO',
  PAIS = 'PAIS',
  SUFIJO_FINAL = 'SUFIJO_FINAL',
}

export class DesignCodeSegmentDto {
  @ApiProperty({ enum: DesignCodeSegmentKey })
  key: DesignCodeSegmentKey;

  @ApiProperty({ example: 'Fase' })
  label: string;

  @ApiProperty({ example: '1' })
  value: string;

  @ApiProperty({
    example: false,
    description:
      'true cuando el valor mostrado es el placeholder "??" por no haber sido etiquetado aún (solo aplica a MO/MD)',
  })
  isMissing: boolean;

  constructor(partial: DesignCodeSegmentDto) {
    Object.assign(this, partial);
  }
}

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

  @ApiProperty({ type: [DesignCodeSegmentDto] })
  segments: DesignCodeSegmentDto[];

  @ApiProperty({
    example: 'LETTER_SUFFIX',
    required: false,
    description:
      'Patrón del formato de sufijo de desambiguación predeterminado; solo presente cuando isDuplicate es true.',
  })
  suffixPattern?: string;

  constructor(partial: Partial<DesignCodeGenerationResponseDto>) {
    Object.assign(this, partial);
  }
}
