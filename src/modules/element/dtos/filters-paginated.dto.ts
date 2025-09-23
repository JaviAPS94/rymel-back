import { IsOptional, IsString, IsArray, IsInt } from 'class-validator';
import { PaginationDto } from 'src/common/dtos/pagination.dto';

export class FiltersPaginatedDto extends PaginationDto {
  @IsOptional()
  @IsString()
  subType?: string;

  @IsOptional()
  @IsString()
  sapReference?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  excludeElementIds?: number[];

  @IsOptional()
  @IsInt()
  normId?: number;
}
