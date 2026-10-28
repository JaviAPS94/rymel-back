import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Length,
} from 'class-validator';
import { DesignBomAdjustment } from '../entities/design-bom-adjustment.entity';

export class SaveDesignBomAdjustmentDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  bomId: number;

  @ApiProperty({ description: 'SHA-256 en hexadecimal de la lista generada sin editar' })
  @IsString()
  @Length(64, 64)
  baseFingerprint: string;

  @ApiProperty({ description: 'Celdas de la hoja ajustada, por referencia' })
  @IsNotEmpty()
  @IsObject()
  cells: Record<string, unknown>;

  @ApiProperty({ example: [12, 15] })
  @IsArray()
  @IsInt({ each: true })
  expandedNodes: number[];
}

export class DesignBomAdjustmentDto {
  @ApiProperty() designId: number;
  @ApiProperty() bomId: number;
  @ApiProperty() baseFingerprint: string;
  @ApiProperty() cells: Record<string, unknown>;
  @ApiProperty() expandedNodes: number[];
  @ApiProperty({ required: false }) updatedBy?: string;
  @ApiProperty() updatedAt: Date;

  constructor(adjustment: DesignBomAdjustment) {
    this.designId = adjustment.designId;
    this.bomId = adjustment.bomId;
    this.baseFingerprint = adjustment.baseFingerprint;
    this.cells = JSON.parse(adjustment.sheet);
    this.expandedNodes = JSON.parse(adjustment.expandedNodes);
    this.updatedBy = adjustment.updatedBy;
    this.updatedAt = adjustment.updatedAt;
  }
}
