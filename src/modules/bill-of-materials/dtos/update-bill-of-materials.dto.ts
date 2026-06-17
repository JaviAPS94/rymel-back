import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateBillOfMaterialsDto {
  @ApiPropertyOptional({ example: 'PT: 1FCV/AU/CM/TC/AF' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Estructura principal vehículo' })
  @IsOptional()
  @IsString()
  name?: string;
}
