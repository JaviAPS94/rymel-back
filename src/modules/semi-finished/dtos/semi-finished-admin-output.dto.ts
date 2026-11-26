import { ApiProperty } from '@nestjs/swagger';
import { SemiFinishedOutputDto } from './semiFinished-output.dto';

export class SemiFinishedAdminOutputDto extends SemiFinishedOutputDto {
  @ApiProperty({
    example: 2,
    description:
      'Estructuras activas que tienen este semielaborado en su árbol',
  })
  bomCount: number;

  @ApiProperty({ example: '2026-11-17T10:00:00.000Z' })
  updatedAt: Date;
}
