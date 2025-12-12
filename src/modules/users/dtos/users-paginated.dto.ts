import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UsersPaginatedDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 10;
}
