import { IsNumber, IsOptional } from 'class-validator';
import { PaginationDto } from 'src/common/dtos/pagination.dto';

export class DesignFiltersPaginatedDto extends PaginationDto {
  @IsOptional()
  @IsNumber()
  designSubtypeId?: number;

  @IsOptional()
  @IsNumber()
  designTypeId?: number;

  @IsOptional()
  designCode?: string;
}
