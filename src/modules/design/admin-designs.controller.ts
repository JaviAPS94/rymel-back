import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ValidationPipe } from '../../common/pipes/validation.pipe';
import { AdminDesignsService } from './services/admin-designs.service';
import {
  AdminDesignFiltersDto,
  AdminDesignPageDto,
  RecalculateDesignDto,
  SubDesignVersionsDto,
  type RecalculateDesignResponse,
} from './dtos/admin-designs.dto';

/**
 * Los diseños del cliente, vistos desde el admin. El detalle y la
 * desactivación son las rutas de siempre (`GET /design/by-id/:id`,
 * `DELETE /design/:id`); aquí va lo que solo necesita el admin.
 */
@ApiTags('Design administration')
@Controller('admin/designs')
@Roles(Role.ADMIN)
export class AdminDesignsController {
  constructor(private readonly service: AdminDesignsService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Listado de diseños con filtros, sin el contenido de las hojas' })
  @ApiResponse({ status: 200, type: AdminDesignPageDto })
  list(@Body(ValidationPipe) filters: AdminDesignFiltersDto): Promise<AdminDesignPageDto> {
    return this.service.list(filters);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Con qué versión de cada fórmula se calculó cada hoja' })
  @ApiResponse({ status: 200, type: [SubDesignVersionsDto] })
  @ApiResponse({ status: 404, description: 'Design not found.' })
  versions(@Param('id', ParseIntPipe) id: number): Promise<SubDesignVersionsDto[]> {
    return this.service.versions(id);
  }

  @Post(':id/recalculate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recalcular las hojas desactualizadas; con dryRun, simular' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Design not found.' })
  recalculate(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: RecalculateDesignDto,
    @Req() request: Request,
  ): Promise<RecalculateDesignResponse> {
    const user = (request as Request & { user?: { email?: string } }).user;
    return this.service.recalculate(id, dto.dryRun, user?.email);
  }
}
