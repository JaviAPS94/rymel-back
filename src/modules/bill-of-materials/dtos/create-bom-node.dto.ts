import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { BomNodeType } from '../enums/bom-node-type.enum';

export class CreateBomNodeDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  semiFinishedId: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  parentId?: number;

  @ApiPropertyOptional({ enum: BomNodeType, example: BomNodeType.STANDARD })
  @IsOptional()
  @IsEnum(BomNodeType)
  type?: BomNodeType;
}
