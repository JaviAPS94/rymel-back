import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

/** Rows copied from Excel, pasted into one process */
export class PastePhantomItemsDto extends ImportPhantomItemsDto {
  @ApiProperty({ example: 3, description: 'Process the rows go to' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  processId: number;

  @ApiProperty({
    description:
      'Tab-separated rows as Excel copies them. The header row is optional: without it, the columns are read in the process order.',
  })
  @IsString()
  @IsNotEmpty()
  // Same order of magnitude as the 10 MB file limit
  @MaxLength(5_000_000)
  text: string;
}

export class ImportIssueDto {
  @ApiPropertyOptional({
    example: 'METALMECANICA',
    description: 'Sheet of the workbook',
  })
  sheet?: string;

  @ApiProperty({ example: 7, description: 'Row number in the file' })
  row: number;

  @ApiPropertyOptional({ example: 'CANT. BASE' })
  column?: string;

  @ApiProperty({ example: 'Value "N/A" is not numeric.' })
  message: string;
}

/** What happened with one sheet of the workbook */
export class SheetImportSummaryDto {
  @ApiProperty({ example: 'METALMECANICA' })
  sheet: string;

  @ApiPropertyOptional({
    example: 4,
    description: 'Absent for a new process in a dry run',
  })
  processId?: number;

  @ApiProperty({ example: 'METALMECANICA' })
  processName: string;

  @ApiProperty({
    example: false,
    description: 'The sheet creates a new process',
  })
  newProcess: boolean;

  @ApiProperty({
    example: false,
    description: 'Hidden sheets are not imported',
  })
  hidden: boolean;

  @ApiPropertyOptional({
    example: ' ',
    description:
      "The process's reference rule: inferred from the sheet for a new process",
  })
  referenceSeparator?: string;

  @ApiProperty({ example: 208 })
  phantomItemsDetected: number;

  @ApiProperty({ example: 208 })
  created: number;

  @ApiProperty({ example: 0 })
  updated: number;

  @ApiProperty({ example: 0 })
  skipped: number;

  @ApiProperty({
    example: 0,
    description: 'Existing items that move to this process',
  })
  moved: number;

  @ApiProperty({
    example: ['Estructura LM'],
    description: 'Headers the process does not use',
  })
  ignoredColumns: string[];

  @ApiProperty({
    example: [],
    description: 'Columns of a new process, as inferred from the sheet',
  })
  columns: { key: string; header: string; scope: string }[];
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

  @ApiProperty({ type: [SheetImportSummaryDto] })
  sheets: SheetImportSummaryDto[];
}
