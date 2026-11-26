import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SemiFinishedService } from './semiFinished.service';
import { SemiFinished } from './entities/semiFinished.entity';
import { SemiFinishedOutputDto } from './dtos/semiFinished-output.dto';
import { SemiFinishedAdminOutputDto } from './dtos/semi-finished-admin-output.dto';
import { CreateSemiFinishedDto } from './dtos/create-semi-finished.dto';
import { UpdateSemiFinishedDto } from './dtos/update-semi-finished.dto';
import { Role } from '../auth/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';

const toOutput = (item: SemiFinished): SemiFinishedOutputDto => {
  const dto = new SemiFinishedOutputDto();
  dto.id = item.id;
  dto.name = item.name;
  dto.code = item.code;
  return dto;
};

@ApiTags('SemiFinished')
@Controller('semi-finished')
export class SemiFinishedController {
  constructor(private readonly semiFinishedService: SemiFinishedService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DESIGN, Role.NORM)
  @ApiOperation({ summary: 'Active semi-finished items, ordered by code' })
  @ApiResponse({
    status: 200,
    description: 'The records have been successfully retrieved.',
    type: SemiFinishedOutputDto,
    isArray: true,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async findAll(): Promise<SemiFinishedOutputDto[]> {
    const semiFinished = await this.semiFinishedService.findAll();
    return semiFinished.map(toOutput);
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Active semi-finished items with how many structures use them',
  })
  @ApiResponse({ status: 200, type: SemiFinishedAdminOutputDto, isArray: true })
  async findAdminList(): Promise<SemiFinishedAdminOutputDto[]> {
    const items = await this.semiFinishedService.findAdminList();
    return items.map((item) => ({
      ...toOutput(item),
      bomCount: item.bomCount,
      updatedAt: item.updatedAt,
    }));
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 200, type: SemiFinishedOutputDto })
  @ApiResponse({ status: 404, description: 'Not found or deleted.' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SemiFinishedOutputDto> {
    return toOutput(await this.semiFinishedService.findOne(id));
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 201, type: SemiFinishedOutputDto })
  @ApiResponse({ status: 409, description: 'Code already in use.' })
  async create(
    @Body(ValidationPipe) dto: CreateSemiFinishedDto,
  ): Promise<SemiFinishedOutputDto> {
    return toOutput(await this.semiFinishedService.create(dto));
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 200, type: SemiFinishedOutputDto })
  @ApiResponse({ status: 404, description: 'Not found or deleted.' })
  @ApiResponse({ status: 409, description: 'Code already in use.' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: UpdateSemiFinishedDto,
  ): Promise<SemiFinishedOutputDto> {
    return toOutput(await this.semiFinishedService.update(id, dto));
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-deletes a semi-finished item not used by any structure',
  })
  @ApiResponse({ status: 409, description: 'Used by active structures.' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.semiFinishedService.remove(id);
  }
}
