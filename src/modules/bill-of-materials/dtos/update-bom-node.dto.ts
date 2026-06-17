import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { BomNodeType } from '../enums/bom-node-type.enum';

export class UpdateBomNodeDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  semiFinishedId?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  parentId?: number;

  @ApiPropertyOptional({ enum: BomNodeType, example: BomNodeType.CRITICAL })
  @IsOptional()
  @IsEnum(BomNodeType)
  type?: BomNodeType;
}
