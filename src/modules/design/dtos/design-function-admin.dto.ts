import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TemplateType } from '../../../common/enums';
import { DesignFunction } from '../entities/design-function.entity';
import { DesignFunctionVersion } from '../entities/design-function-version.entity';
import type { Warning } from '../validation/design-function-rules';

export class ListDesignFunctionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: TemplateType })
  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  /** Busca en el nombre y en el código. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  designSubTypeId?: number;

  /** Incluir las fórmulas dadas de baja. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted?: boolean = false;
}

/**
 * Fórmula en el listado de administración.
 *
 * **No lleva la expresión, ni cifrada ni en claro.** El listado se pide para
 * navegar, no para editar; exponer el activo protegido en cada carga de
 * pantalla multiplicaría sin motivo las ocasiones de filtrarlo.
 */
export class DesignFunctionListItemDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: TemplateType }) type: TemplateType;
  @ApiPropertyOptional() description?: string;

  @ApiProperty({ description: 'Número de la versión vigente' })
  version: number;

  @ApiProperty({ description: 'Variables declaradas, en su orden' })
  variables: string;

  @ApiProperty({ description: 'Cuántas versiones tiene el historial' })
  versionCount: number;

  @ApiProperty({ description: 'Subtipos de diseño a los que está asignada' })
  subTypeCount: number;

  @ApiProperty({ description: 'Dada de baja' })
  deleted: boolean;

  @ApiPropertyOptional({
    description:
      'Motivo por el que su código colisiona con el de otra fórmula activa',
  })
  codeConflict?: string;
}

/** Detalle para editar: incluye la expresión en claro. */
export class DesignFunctionDetailDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: TemplateType }) type: TemplateType;
  @ApiPropertyOptional() description?: string;

  @ApiPropertyOptional({
    description:
      'Expresión en texto plano. Ausente si el motor cifrado no respondió.',
  })
  expression?: string;

  @ApiPropertyOptional({
    description: 'Por qué no se pudo recuperar la expresión',
  })
  expressionUnavailable?: string;

  @ApiProperty() variables: string;
  @ApiProperty() constants: Record<string, number>;
  @ApiProperty() version: number;
  @ApiProperty() versionId: number;
  @ApiProperty({ type: [Number] }) designSubTypeIds: number[];
}

export class CreateDesignFunctionAdminDto {
  @IsNotEmpty() @IsString() name: string;
  @IsNotEmpty() @IsString() code: string;

  @ApiProperty({ description: 'Expresión en texto plano; se cifra al guardar' })
  @IsNotEmpty()
  @IsString()
  expression: string;

  @ApiProperty({ description: 'Variables en su orden, separadas por coma' })
  @IsNotEmpty()
  @IsString()
  variables: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  constants?: Record<string, number>;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ enum: TemplateType })
  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;
}

/** Cambios de identidad: no publican versión. */
export class UpdateDesignFunctionDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;
}

export class PublishVersionDto {
  @IsNotEmpty() @IsString() expression: string;
  @IsNotEmpty() @IsString() variables: string;

  @IsOptional() @IsObject() constants?: Record<string, number>;

  @ApiPropertyOptional({
    description:
      'Confirma un cambio que altera el significado de las hojas ya guardadas',
  })
  @IsOptional()
  @IsBoolean()
  acceptWarnings?: boolean;
}

/** Prueba una expresión sin guardarla. */
export class TestExpressionDto {
  @IsNotEmpty() @IsString() expression: string;

  @ApiProperty({ description: 'Valores de prueba por variable' })
  @IsObject()
  parameters: Record<string, number>;

  @IsOptional() @IsObject() constants?: Record<string, number>;
}

export class TestExpressionResultDto {
  @ApiProperty() ok: boolean;
  @ApiPropertyOptional() result?: number;
  @ApiPropertyOptional() error?: string;
  @ApiProperty({ type: [String] }) missingVariables: string[];
}

export class AssignSubTypesDto {
  @ApiProperty({
    type: [Number],
    description: 'Subtipos a los que queda asignada',
  })
  designSubTypeIds: number[];
}

/** Qué se ve afectado por un cambio en la fórmula. */
export class DesignFunctionImpactDto {
  @ApiProperty() designFunctionId: number;
  @ApiProperty() subTypeCount: number;
  @ApiProperty({ type: [String] }) subTypeNames: string[];
  @ApiProperty({ description: 'Sub-diseños con celdas que la invocan' })
  subDesignCount: number;
  @ApiProperty() designCount: number;
  @ApiProperty({ description: 'De ellos, calculados con una versión anterior' })
  staleSubDesignCount: number;
}

export class PublishVersionResultDto {
  @ApiProperty() version: number;
  @ApiProperty() versionId: number;
  @ApiProperty({ type: [String] }) warnings: string[];

  constructor(version: DesignFunctionVersion, warnings: Warning[]) {
    this.version = version.version;
    this.versionId = version.id;
    this.warnings = warnings.map((warning) => warning.message);
  }
}

export class DesignFunctionVersionDto {
  @ApiProperty() id: number;
  @ApiProperty() version: number;
  @ApiProperty() isCurrent: boolean;
  @ApiProperty() variables: string;
  @ApiProperty() constants: Record<string, number>;
  @ApiPropertyOptional() createdBy?: string;
  @ApiProperty() createdAt: Date;

  constructor(version: DesignFunctionVersion) {
    this.id = version.id;
    this.version = version.version;
    this.isCurrent = version.isCurrent;
    this.variables = version.variables;
    this.constants = version.constants
      ? (JSON.parse(version.constants) as Record<string, number>)
      : {};
    this.createdBy = version.createdBy;
    this.createdAt = version.createdAt;
  }
}

export class PaginatedDesignFunctionsDto {
  @ApiProperty({ type: [DesignFunctionListItemDto] })
  items: DesignFunctionListItemDto[];

  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;

  @ApiProperty({
    description:
      'Conflictos de código entre las fórmulas activas, heredados de antes de la validación',
  })
  codeConflicts: string[];
}

export const identityOf = (
  designFunction: DesignFunction,
): Pick<DesignFunction, 'id' | 'name' | 'code' | 'type' | 'description'> => ({
  id: designFunction.id,
  name: designFunction.name,
  code: designFunction.code,
  type: designFunction.type,
  description: designFunction.description,
});
