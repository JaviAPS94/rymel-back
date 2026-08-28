import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Aviso para el diseñador: qué le pasó a los valores de esta hoja.
 *
 * Un recálculo reescribe números que alguien ya vio y sobre los que quizá
 * tomó una decisión. Que cambien en silencio, entre una sesión y la
 * siguiente, es peor que el número viejo: quien abre el diseño no tiene forma
 * de saber que lo que mira no es lo que dejó.
 */
export class RecalculatedCellDto {
  @ApiProperty({ example: 'B11' })
  ref: string;

  @ApiProperty({ example: '=QUADRATIC(A11)' })
  formula: string;

  @ApiProperty({ description: 'Valor que tenía antes del recálculo' })
  before: unknown;

  @ApiProperty({ description: 'Valor actual' })
  after: unknown;
}

export class ResponsibleFunctionDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ description: 'Versión que se aplicó' })
  version: number;
}

export class RecalculationNoticeDto {
  @ApiProperty({ example: 74 })
  subDesignId: number;

  /**
   * La hoja se calculó con una versión de fórmula que ya no es la vigente.
   * Sus valores siguen siendo los guardados: nadie los ha tocado.
   */
  @ApiProperty()
  isStale: boolean;

  @ApiPropertyOptional({ description: 'Cuándo se recalculó por última vez' })
  recalculatedAt?: Date;

  @ApiPropertyOptional({
    description: 'Identificador del recálculo, para poder descartar el aviso',
  })
  recalculationId?: number;

  @ApiProperty({ type: [RecalculatedCellDto] })
  changedCells: RecalculatedCellDto[];

  @ApiProperty({ type: [ResponsibleFunctionDto] })
  functions: ResponsibleFunctionDto[];
}
