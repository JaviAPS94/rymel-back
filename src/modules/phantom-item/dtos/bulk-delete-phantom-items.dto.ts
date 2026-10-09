import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class BulkDeletePhantomItemsDto {
  @ApiProperty({
    example: [12, 15, 40],
    description: 'Phantom items to delete',
  })
  @IsArray()
  @ArrayMinSize(1)
  // A whole process at most (METALMECANICA has 208); more is likely a mistake
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  ids: number[];
}
