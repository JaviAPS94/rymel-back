import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { DesignCodeSapSegmentName } from '../enums/design-code-sap-segment-name.enum';

export class CreateSapSegmentMappingDto {
  @ApiProperty({ enum: DesignCodeSapSegmentName })
  @IsEnum(DesignCodeSapSegmentName)
  segmentName: DesignCodeSapSegmentName;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  segmentIndex: number;
}

export class UpdateSapSegmentMappingDto {
  @ApiProperty({ enum: DesignCodeSapSegmentName, required: false })
  @IsOptional()
  @IsEnum(DesignCodeSapSegmentName)
  segmentName?: DesignCodeSapSegmentName;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  segmentIndex?: number;
}
