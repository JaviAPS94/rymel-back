import { ApiProperty } from '@nestjs/swagger';
import { TemplateType } from 'src/common/enums';
import { DesignFunction } from '../entities/design-function.entity';
import { DesignFunctionVersion } from '../entities/design-function-version.entity';

/**
 * Fórmula tal como la ven los consumidores de una hoja de cálculo.
 *
 * **No lleva la expresión, en ninguna forma.** project-front la recibía
 * cifrada y nunca la descifraba; lo único que hacía con ella era buscar y
 * exportar un bloque hexadecimal, así que retirarla no le quita nada. Ahora
 * solo envía `designFunctionId` y parámetros, y el servidor evalúa.
 */
export class DesignFunctionOutputDto {
  @ApiProperty({
    description: 'The unique identifier of the design function',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The name of the design function',
    example: 'Ohms Law',
  })
  name: string;

  @ApiProperty({
    description: 'The code of the design function',
    example: 'CUBIC',
  })
  code: string;

  @ApiProperty({
    description: 'The variables used in the expression',
    example: 'x,b',
  })
  variables: string;

  @ApiProperty({
    description: 'The constants used in the expression',
    example: '{"CONST_1": 1}',
  })
  constants: Record<string, number>;

  @ApiProperty({
    description: 'Optional description of the function',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Número de la versión vigente',
    example: 1,
  })
  version: number;

  @ApiProperty({
    description:
      'Identificador de la versión vigente, para estampar el cálculo',
    example: 4,
  })
  versionId: number;

  type: TemplateType;

  constructor(designFunction: DesignFunction) {
    const current = currentVersionOf(designFunction);

    this.id = designFunction.id;
    this.name = designFunction.name;
    this.code = designFunction.code;
    this.description = designFunction.description;
    this.type = designFunction.type;

    this.variables = current?.variables ?? '';
    this.constants = parseConstants(current?.constants);
    this.version = current?.version ?? 0;
    this.versionId = current?.id ?? 0;
  }
}

/** Versión vigente de una fórmula, si sus versiones vienen cargadas. */
export const currentVersionOf = (
  designFunction: DesignFunction,
): DesignFunctionVersion | undefined =>
  designFunction.versions?.find((version) => version.isCurrent);

/**
 * Las constantes se guardan como JSON en texto. Un JSON corrupto no debe
 * tumbar la lectura de todo un subtipo: se trata como "sin constantes", que
 * es además lo que ocurría antes con las filas que las tenían nulas.
 */
export const parseConstants = (
  raw: string | null | undefined,
): Record<string, number> => {
  if (raw === null || raw === undefined || raw === '') return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
};
