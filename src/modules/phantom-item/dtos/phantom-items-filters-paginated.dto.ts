import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PhantomItemsFiltersPaginatedDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    example: 'KIT EMBLE',
    description: 'Partial match on itemCode, reference and shortDescription',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '1CA' })
  @IsOptional()
  @IsString()
  finishedProductType?: string;

  @ApiPropertyOptional({ example: 'TPI' })
  @IsOptional()
  @IsString()
  workInProcessType?: string;

  @ApiPropertyOptional({ example: 'KIT EMBLE' })
  @IsOptional()
  @IsString()
  phantomRootCode?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  processId?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  familyId?: number;
}
