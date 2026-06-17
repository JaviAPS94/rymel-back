import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateBillOfMaterialsDto {
  @ApiProperty({ example: 'PT: 1FCV/AU/CM/TC/AF' })
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiProperty({ example: 'Estructura principal vehículo' })
  @IsNotEmpty()
  @IsString()
  name: string;
}
