import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export enum PhantomItemImportMode {
  /** An item that already exists is reported as skipped due to conflict */
  CREATE = 'create',
  /** An item that already exists is updated and its components replaced */
  UPSERT = 'upsert',
}

export class ImportPhantomItemsDto {
  @ApiPropertyOptional({
    enum: PhantomItemImportMode,
    default: PhantomItemImportMode.CREATE,
  })
  @IsOptional()
  @IsEnum(PhantomItemImportMode)
  mode?: PhantomItemImportMode = PhantomItemImportMode.CREATE;

  @ApiPropertyOptional({
    default: false,
    description:
      'Processes and validates the file without writing to the database',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  dryRun?: boolean = false;
}

export class ImportIssueDto {
  @ApiProperty({ example: 7, description: 'Row number in the file' })
  row: number;

  @ApiPropertyOptional({ example: 'CANT. BASE' })
  column?: string;

  @ApiProperty({ example: 'Value "N/A" is not numeric.' })
  message: string;
}

export class ImportResultDto {
  @ApiProperty({ example: false })
  dryRun: boolean;

  @ApiProperty({ example: 2 })
  created: number;

  @ApiProperty({ example: 0 })
  updated: number;

  @ApiProperty({
    example: 1,
    description: 'Groups skipped due to conflict or error',
  })
  skipped: number;

  @ApiProperty({ example: 24, description: 'Data rows read' })
  rowsRead: number;

  @ApiProperty({ example: 3, description: 'Item groups detected' })
  phantomItemsDetected: number;

  @ApiProperty({ type: [ImportIssueDto] })
  errors: ImportIssueDto[];

  @ApiProperty({ type: [ImportIssueDto] })
  warnings: ImportIssueDto[];
}
