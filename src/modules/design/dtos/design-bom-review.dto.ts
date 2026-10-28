import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Estado de la lista de materiales de un diseño, de más a menos avanzado: un
 * diseño ajustado cuenta como ajustado aunque su estructura ya no coincida.
 */
export const BOM_REVIEW_STATUSES = [
  'adjusted',
  'generable',
  'no-structure',
  'no-reference',
] as const;
export type BomReviewStatus = (typeof BOM_REVIEW_STATUSES)[number];

export class DesignBomReviewFiltersDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  normId?: number;

  @ApiPropertyOptional({ description: 'Parte de la referencia ERP de algún elemento' })
  @IsOptional()
  @IsString()
  sapReference?: string;

  @ApiPropertyOptional({ enum: BOM_REVIEW_STATUSES })
  @IsOptional()
  @IsIn(BOM_REVIEW_STATUSES)
  status?: BomReviewStatus;

  @ApiPropertyOptional({ enum: ['created', 'adjusted'], description: 'A qué fecha se aplica el rango' })
  @IsOptional()
  @IsIn(['created', 'adjusted'])
  dateField?: 'created' | 'adjusted';

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class DesignBomReviewElementDto {
  @ApiProperty() id: number;
  @ApiProperty({ required: false }) sapReference?: string;
  @ApiProperty({ required: false }) normId?: number;
  @ApiProperty({ required: false }) normName?: string;
}

export class DesignBomReviewRowDto {
  @ApiProperty() id: number;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ required: false }) country?: string;
  @ApiProperty({ type: [DesignBomReviewElementDto] }) elements: DesignBomReviewElementDto[];
  @ApiProperty({ enum: BOM_REVIEW_STATUSES }) status: BomReviewStatus;
  @ApiProperty({ required: false, nullable: true })
  adjustment: { updatedBy?: string; updatedAt: Date } | null;
}

export class DesignBomReviewPageDto {
  @ApiProperty({ type: [DesignBomReviewRowDto] }) data: DesignBomReviewRowDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
  @ApiProperty({ description: 'Normas con algún diseño activo, para el filtro' })
  norms: { id: number; name: string }[];
}
