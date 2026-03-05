import { ApiProperty } from '@nestjs/swagger';
import { DesignType } from '../entities/design-type.entity';

export class DesignTypeOutputDto {
  @ApiProperty({
    description: 'The unique identifier of the design type',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The name of the design type',
    example: 'Distribution',
  })
  name: string;

  constructor(designType: DesignType) {
    this.id = designType.id;
    this.name = designType.name;
  }
}
