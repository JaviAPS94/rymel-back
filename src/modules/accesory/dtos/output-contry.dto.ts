import { ApiProperty } from '@nestjs/swagger';

export class OutputAccesoryDto {
  @ApiProperty({
    example: 1,
  })
  id: number;
  @ApiProperty({
    example: '06010504',
  })
  reference: string;
  @ApiProperty({
    example: 'INDICADOR NIVEL ACEITE CON CONTACTOS',
  })
  description: string;
  @ApiProperty({
    example: 'UND',
  })
  unitOfMeasurement: string;
  @ApiProperty({
    example: 29552.27,
  })
  averageCost: number;
  @ApiProperty({
    example: 29552.27,
  })
  lastCost: number;

  static fromEntity(entity: any): OutputAccesoryDto {
    const dto = new OutputAccesoryDto();
    dto.id = entity.item_id;
    dto.reference = entity.referencia;
    dto.description = entity.descripcion;
    dto.unitOfMeasurement = entity.unidad_inventario;
    dto.averageCost = entity.costo_promedio;
    dto.lastCost = entity.ultimo_costo;
    return dto;
  }
}
