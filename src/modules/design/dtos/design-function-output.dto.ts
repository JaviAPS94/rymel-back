import { ApiProperty } from '@nestjs/swagger';
import { TemplateType } from 'src/common/enums';
import { DesignFunction } from '../entities/design-function.entity';

export class DesignFunctionOutputDto {
  @ApiProperty({
    description: 'The unique identifier of the design function',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The name of the design function',
    example: 'Ohms Law',
  })
  name: string;

  @ApiProperty({
    description: 'The code of the design function',
    example: 'CUBIC',
  })
  code: string;

  @ApiProperty({
    description: 'The mathematical expression (decrypted)',
    example: 'V = I * R',
  })
  expression: string;

  @ApiProperty({
    description: 'The variables used in the expression (decrypted)',
    example: 'I,R',
  })
  variables: string;

  @ApiProperty({
    description: 'The constants used in the expression',
    example: '{"calculation": 1}',
  })
  constants: Record<string, number>;

  @ApiProperty({
    description: 'Optional description of the function',
    example:
      'Calculates the relationship between voltage, current, and resistance',
    required: false,
  })
  description?: string;

  type: TemplateType;

  constructor(designFunction: DesignFunction) {
    this.id = designFunction.id;
    this.name = designFunction.name;
    this.expression = designFunction.expression;
    this.variables = designFunction.variables;
    this.description = designFunction.description;
    this.code = designFunction.code;
    this.constants = JSON.parse(designFunction.constants || '{}');
    this.type = designFunction.type;
  }
}
