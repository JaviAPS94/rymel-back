import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { RecalculationReport } from '../services/design-recalculation.service';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

export class AdminDesignFiltersDto {
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

  @ApiPropertyOptional({ description: 'Parte del código o del nombre' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  normId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  countryId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  designTypeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  designSubtypeId?: number;

  @ApiPropertyOptional({ description: 'Parte de la referencia ERP de algún elemento' })
  @IsOptional()
  @IsString()
  sapReference?: string;

  @ApiPropertyOptional({ enum: ['created', 'updated'] })
  @IsOptional()
  @IsIn(['created', 'updated'])
  dateField?: 'created' | 'updated';

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Alguna hoja desactualizada' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  stale?: boolean;

  @ApiPropertyOptional({ description: 'Con lista de materiales ajustada por el cliente' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  adjusted?: boolean;
}

export interface NamedOption {
  id: number;
  name: string;
}

export class AdminDesignElementDto {
  @ApiProperty() id: number;
  @ApiProperty({ required: false }) sapReference?: string;
  @ApiProperty({ required: false }) norm?: NamedOption;
  @ApiProperty({ required: false }) country?: NamedOption;
}

export class AdminDesignRowDto {
  @ApiProperty() id: number;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ required: false }) designType?: NamedOption;
  @ApiProperty({ required: false }) designSubType?: NamedOption;
  @ApiProperty({ type: [AdminDesignElementDto] }) elements: AdminDesignElementDto[];
  @ApiProperty({ description: 'Alguna hoja desactualizada' }) stale: boolean;
  @ApiProperty({ required: false, nullable: true })
  bomAdjustment: { updatedBy?: string; updatedAt: Date } | null;
}

export class AdminDesignPageDto {
  @ApiProperty({ type: [AdminDesignRowDto] }) data: AdminDesignRowDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
  @ApiProperty({ description: 'Opciones de los filtros: solo las que tienen diseños activos' })
  options: {
    norms: NamedOption[];
    countries: NamedOption[];
    designTypes: NamedOption[];
    designSubTypes: (NamedOption & { designTypeId?: number })[];
  };
}

export class RecalculateDesignDto {
  @ApiProperty({ description: 'Simular sin escribir' })
  @Transform(toBoolean)
  @IsBoolean()
  dryRun: boolean;
}

export type RecalculateDesignResponse = RecalculationReport;

/** Con qué versión de cada fórmula se calculó una hoja, frente a la vigente. */
export class SubDesignVersionsDto {
  @ApiProperty() subDesignId: number;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'Calculada con una versión que ya no es la vigente' }) stale: boolean;
  @ApiProperty() functions: {
    functionId: number;
    code?: string;
    name?: string;
    /** Versión con la que se calculó; ausente si la versión ya no existe. */
    usedVersion?: number;
    currentVersion?: number;
  }[];
}
