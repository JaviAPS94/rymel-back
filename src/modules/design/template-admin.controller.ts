/**
 * API de administración de plantillas de diseño.
 *
 * Va bajo `admin/templates`, igual que `admin/design-functions`, y no bajo
 * `design/templates`. No es solo convención: `design/templates/:subTypeId` ya
 * existe y es la ruta que consume la biblioteca del diseñador, de modo que
 * `design/templates/admin` se leería como el subtipo llamado «admin».
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ValidationPipe } from '../../common/pipes/validation.pipe';
import {
  TemplateAdminService,
  type ActingUser,
} from './services/template-admin.service';
import {
  CreateSheetDto,
  CreateTemplateDto,
  DuplicateTemplateDto,
  ListTemplatesDto,
  PaginatedTemplatesDto,
  PublishResultDto,
  PublishTemplateDto,
  ReorderSheetsDto,
  SaveSheetDto,
  TemplateDetailDto,
  TemplateRevisionDto,
  UpdateTemplateDto,
} from './dtos/template-admin.dto';

const actingUser = (request: Request): ActingUser => {
  const user = (request as Request & { user?: ActingUser }).user;
  return { id: user?.id, email: user?.email };
};

@ApiTags('Template administration')
@Controller('admin/templates')
@Roles(Role.ADMIN)
export class TemplateAdminController {
  constructor(private readonly service: TemplateAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Listado de plantillas con búsqueda y filtros' })
  @ApiResponse({ status: 200, type: PaginatedTemplatesDto })
  list(
    @Query(new ValidationPipe()) query: ListTemplatesDto,
  ): Promise<PaginatedTemplatesDto> {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'La plantilla para el editor: su borrador si lo hay, si no lo publicado',
  })
  @ApiResponse({ status: 200, type: TemplateDetailDto })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<TemplateDetailDto> {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una plantilla, que nace en borrador' })
  @ApiResponse({ status: 201, type: TemplateDetailDto })
  create(
    @Body(new ValidationPipe()) dto: CreateTemplateDto,
  ): Promise<TemplateDetailDto> {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar los metadatos' })
  @ApiResponse({ status: 200, type: TemplateDetailDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: UpdateTemplateDto,
  ): Promise<TemplateDetailDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Baja lógica; su código queda libre' })
  @ApiResponse({ status: 200 })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.remove(id);
  }

  @Post(':id/sheets')
  @ApiOperation({ summary: 'Añadir una hoja al borrador' })
  @ApiResponse({ status: 201, type: TemplateDetailDto })
  createSheet(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: CreateSheetDto,
  ): Promise<TemplateDetailDto> {
    return this.service.createSheet(id, dto);
  }

  /**
   * `PUT` sobre la colección: fija qué hojas tiene el borrador y en qué orden.
   *
   * Va aquí y no en `:id/sheets/:name` porque es la colección entera, y así
   * además no colisiona con una hoja que se llamara como la operación.
   */
  @Put(':id/sheets')
  @ApiOperation({
    summary: 'Fijar la lista de hojas del borrador: cuáles hay y en qué orden',
  })
  @ApiResponse({ status: 200, type: TemplateDetailDto })
  setSheets(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: ReorderSheetsDto,
  ): Promise<TemplateDetailDto> {
    return this.service.setSheets(id, dto);
  }

  /**
   * Alias obsoleto de la ruta anterior.
   *
   * Renombrar una ruta obliga a desplegar cliente y servidor a la vez, y si el
   * cliente llega primero se lleva un 404 —que es exactamente lo que pasó—.
   * Se mantiene un tiempo para que el orden de despliegue deje de importar.
   *
   * @deprecated Usar `PUT /:id/sheets`. Se retira cuando no queden clientes
   * anteriores al cambio de estructura.
   */
  @Put(':id/sheet-order')
  @ApiOperation({ summary: 'Alias obsoleto de PUT /:id/sheets' })
  @ApiResponse({ status: 200, type: TemplateDetailDto })
  setSheetsLegacy(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: ReorderSheetsDto,
  ): Promise<TemplateDetailDto> {
    return this.service.setSheets(id, dto);
  }

  @Put(':id/sheets/:name')
  @ApiOperation({ summary: 'Guardar una sola hoja del borrador' })
  @ApiResponse({ status: 200, type: TemplateDetailDto })
  @ApiResponse({
    status: 409,
    description: 'La plantilla cambió desde que se cargó',
  })
  saveSheet(
    @Param('id', ParseIntPipe) id: number,
    @Param('name') name: string,
    @Body(new ValidationPipe()) dto: SaveSheetDto,
  ): Promise<TemplateDetailDto> {
    return this.service.saveSheet(id, name, dto);
  }

  @Delete(':id/sheets/:name')
  @ApiOperation({ summary: 'Quitar una hoja del borrador' })
  @ApiResponse({ status: 200, type: TemplateDetailDto })
  deleteSheet(
    @Param('id', ParseIntPipe) id: number,
    @Param('name') name: string,
  ): Promise<TemplateDetailDto> {
    return this.service.deleteSheet(id, name);
  }

  @Post(':id/publish')
  @ApiOperation({
    summary: 'Validar y publicar el borrador; sin publicar si hay diagnósticos',
  })
  @ApiResponse({ status: 200, type: PublishResultDto })
  publish(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: PublishTemplateDto,
    @Req() request: Request,
  ): Promise<PublishResultDto> {
    return this.service.publish(id, actingUser(request), dto.reason);
  }

  @Delete(':id/draft')
  @ApiOperation({ summary: 'Descartar los cambios sin publicar' })
  @ApiResponse({ status: 200 })
  async discardDraft(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.discardDraft(id);
  }

  @Post(':id/duplicate')
  @ApiOperation({
    summary: 'Copiar la plantilla como borrador, con código nuevo',
  })
  @ApiResponse({ status: 201, type: TemplateDetailDto })
  duplicate(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: DuplicateTemplateDto,
  ): Promise<TemplateDetailDto> {
    return this.service.duplicate(id, dto);
  }

  @Get(':id/revisions')
  @ApiOperation({ summary: 'Instantáneas guardadas de la plantilla' })
  @ApiResponse({ status: 200, type: [TemplateRevisionDto] })
  listRevisions(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TemplateRevisionDto[]> {
    return this.service.listRevisions(id);
  }

  @Post(':id/revisions/:revisionId/restore')
  @ApiOperation({
    summary: 'Traer una instantánea al borrador, sin tocar lo publicado',
  })
  @ApiResponse({ status: 200, type: TemplateDetailDto })
  restoreRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
  ): Promise<TemplateDetailDto> {
    return this.service.restoreRevision(id, revisionId);
  }
}
