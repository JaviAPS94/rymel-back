import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type {
  TemplateDiagnostic,
  TemplateDocument,
} from '@rymel/design-template';
import { TemplateStatus, TemplateType } from '../../../common/enums';

export class ListTemplatesDto {
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

  /** Busca en el nombre y en el código. */
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TemplateType })
  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @ApiPropertyOptional({ enum: TemplateStatus })
  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  designSubTypeId?: number;

  /** Incluir las plantillas dadas de baja. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted?: boolean = false;
}

/**
 * Plantilla en el listado.
 *
 * Lleva el número de hojas y de celdas a propósito. Es lo que distingue de un
 * vistazo una plantilla terminada de una vacía, que es justo lo que hoy no se
 * puede saber sin abrirla: tres de las cuatro plantillas de la base no tienen
 * una sola hoja y se ofrecían como si sirvieran.
 */
export class TemplateListItemDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: TemplateType }) type: TemplateType;
  @ApiProperty({ enum: TemplateStatus }) status: TemplateStatus;
  @ApiProperty() version: number;
  @ApiPropertyOptional() designSubTypeId?: number;
  @ApiPropertyOptional() designSubTypeName?: string;
  @ApiProperty() sheetCount: number;
  @ApiProperty() cellCount: number;
  /** Si hay cambios sin publicar. */
  @ApiProperty() hasDraft: boolean;
  @ApiPropertyOptional() contractVersion?: string;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedTemplatesDto {
  @ApiProperty({ type: [TemplateListItemDto] }) items: TemplateListItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

/**
 * La plantilla completa para el editor.
 *
 * `document` es el `TemplateDocument` del contrato compartido, sin
 * transformar: el editor y el servidor hablan exactamente del mismo objeto.
 */
export class TemplateDetailDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: TemplateStatus }) status: TemplateStatus;
  @ApiProperty() version: number;
  /** Si lo que se devuelve son cambios sin publicar. */
  @ApiProperty() hasDraft: boolean;
  @ApiPropertyOptional() designSubTypeId?: number;
  @ApiProperty() document: TemplateDocument;
  /**
   * Marca de la última escritura del borrador. El editor la devuelve al
   * guardar; es lo que permite detectar que otra sesión escribió en medio.
   */
  @ApiPropertyOptional() draftUpdatedAt?: Date;
  @ApiProperty({ type: Object, isArray: true })
  diagnostics: TemplateDiagnostic[];
}

export class CreateTemplateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TemplateType })
  @IsEnum(TemplateType)
  type: TemplateType;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  designSubTypeId: number;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TemplateType })
  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  designSubTypeId?: number;
}

/**
 * Una hoja que llega del editor.
 *
 * Viaja sola, no dentro del documento entero: la hoja más grande que hay
 * guardada son 236 KB y reenviar la plantilla completa cada vez que se
 * corrige un rótulo es desperdicio en cada guardado.
 */
export class SaveSheetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ type: Object })
  @IsObject()
  cells: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  styles?: Record<string, unknown>;

  /**
   * Cuándo se cargó el borrador que el editor está modificando. Si el
   * borrador cambió después, la escritura se rechaza en vez de pisar los
   * cambios de la otra sesión.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class CreateSheetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class ReorderSheetsDto {
  /** Nombres de las hojas en el orden deseado. */
  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  names: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class DuplicateTemplateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  /**
   * Subtipo de destino. Cambiarlo puede dejar inválidas las fórmulas de
   * diseño que la plantilla invoca, porque están asignadas por subtipo; la
   * validación lo dirá al publicar.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  designSubTypeId?: number;
}

export class PublishTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class PublishResultDto {
  @ApiProperty() published: boolean;
  @ApiProperty() version: number;
  @ApiProperty({ type: Object, isArray: true })
  diagnostics: TemplateDiagnostic[];
}

export class TemplateRevisionDto {
  @ApiProperty() id: number;
  @ApiProperty() version: number;
  @ApiPropertyOptional() author?: string;
  @ApiPropertyOptional() reason?: string;
  @ApiPropertyOptional() contractVersion?: string;
  @ApiProperty() createdAt: Date;
}

/** Un campo del elemento que una celda puede declarar como `elementKey`. */
export class ElementFieldDto {
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty() type: string;
}
