/**
 * API de administración de fórmulas de diseño.
 *
 * Va bajo `admin/` y con `@Roles(Role.ADMIN)` a nivel de clase, separada de
 * `design-functions`, que es la que consumen las hojas de cálculo. La frontera
 * es deliberada: en esta viven las operaciones que pueden exponer o alterar el
 * activo protegido, y conviene que eso se vea en la propia ruta.
 */

import {
  BadRequestException,
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
import { DesignFunctionAdminService } from './services/design-function-admin.service';
import {
  DesignFunctionVersionService,
  type ActingUser,
} from './services/design-function-version.service';
import { DesignRecalculationService } from './services/design-recalculation.service';
import { ValidationError } from './validation/design-function-rules';
import {
  AssignSubTypesDto,
  CreateDesignFunctionAdminDto,
  DesignFunctionDetailDto,
  DesignFunctionImpactDto,
  DesignFunctionVersionDto,
  ListDesignFunctionsDto,
  PaginatedDesignFunctionsDto,
  PublishVersionDto,
  PublishVersionResultDto,
  TestExpressionDto,
  TestExpressionResultDto,
  UpdateDesignFunctionDto,
} from './dtos/design-function-admin.dto';

/** El usuario autenticado, tal como lo deja la estrategia JWT en la petición. */
const actingUser = (request: Request): ActingUser => {
  const user = (request as Request & { user?: ActingUser }).user;
  return { id: user?.id, email: user?.email };
};

/**
 * `ValidationError` es un error de dominio, no un fallo del servidor. Sin esta
 * traducción saldría como 500 y el administrador vería "error interno" en vez
 * de "el código ya lo usa otra fórmula".
 */
const asHttp = (error: unknown): never => {
  if (error instanceof ValidationError) {
    throw new BadRequestException(error.message);
  }
  throw error as Error;
};

@ApiTags('Design Functions (admin)')
@Controller('admin/design-functions')
@Roles(Role.ADMIN)
export class DesignFunctionAdminController {
  constructor(
    private readonly admin: DesignFunctionAdminService,
    private readonly versions: DesignFunctionVersionService,
    private readonly recalculation: DesignRecalculationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las fórmulas. No incluye la expresión en ninguna forma.',
  })
  @ApiResponse({ status: 200, type: PaginatedDesignFunctionsDto })
  list(
    @Query(ValidationPipe) query: ListDesignFunctionsDto,
  ): Promise<PaginatedDesignFunctionsDto> {
    return this.admin.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Detalle para editar, con la expresión en claro. Cada lectura queda auditada.',
  })
  @ApiResponse({ status: 200, type: DesignFunctionDetailDto })
  detail(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
  ): Promise<DesignFunctionDetailDto> {
    return this.admin.detail(id, actingUser(request));
  }

  @Get(':id/impact')
  @ApiOperation({
    summary: 'A cuántos subtipos, diseños y sub-diseños alcanza un cambio',
  })
  @ApiResponse({ status: 200, type: DesignFunctionImpactDto })
  impact(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DesignFunctionImpactDto> {
    return this.admin.impact(id);
  }

  @Get(':id/versions')
  @ApiOperation({
    summary: 'Historial de versiones, de la más reciente a la más antigua',
  })
  @ApiResponse({ status: 200, type: [DesignFunctionVersionDto] })
  async history(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DesignFunctionVersionDto[]> {
    const versions = await this.versions.history(id);
    return versions.map((version) => new DesignFunctionVersionDto(version));
  }

  @Post()
  @ApiOperation({ summary: 'Crea una fórmula con su versión 1' })
  async create(
    @Body(ValidationPipe) dto: CreateDesignFunctionAdminDto,
  ): Promise<{ id: number; warnings: string[] }> {
    try {
      return await this.admin.create(dto);
    } catch (error) {
      return asHttp(error);
    }
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Cambia nombre, código, descripción o tipo. No publica versión.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: UpdateDesignFunctionDto,
  ): Promise<void> {
    try {
      await this.admin.update(id, dto);
    } catch (error) {
      asHttp(error);
    }
  }

  @Post(':id/versions')
  @ApiOperation({
    summary:
      'Publica una versión nueva. Un cambio que altere las hojas ya guardadas exige acceptWarnings.',
  })
  @ApiResponse({ status: 201, type: PublishVersionResultDto })
  async publish(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: PublishVersionDto,
  ): Promise<PublishVersionResultDto> {
    try {
      const published = await this.versions.publish({
        designFunctionId: id,
        expression: dto.expression,
        variables: dto.variables,
        constants: dto.constants ?? {},
        acceptWarnings: dto.acceptWarnings,
      });
      return new PublishVersionResultDto(published.version, published.warnings);
    } catch (error) {
      return asHttp(error);
    }
  }

  @Post(':id/versions/:version/restore')
  @ApiOperation({
    summary:
      'Restaura una versión anterior publicándola como nueva. No reescribe el historial.',
  })
  async restore(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<DesignFunctionVersionDto> {
    try {
      return new DesignFunctionVersionDto(
        await this.versions.restore(id, version),
      );
    } catch (error) {
      return asHttp(error);
    }
  }

  @Post('test')
  @ApiOperation({
    summary: 'Evalúa una expresión con valores de prueba. No guarda nada.',
  })
  @ApiResponse({ status: 200, type: TestExpressionResultDto })
  test(
    @Body(ValidationPipe) dto: TestExpressionDto,
  ): Promise<TestExpressionResultDto> {
    return this.admin.testExpression(dto);
  }

  @Put(':id/subtypes')
  @ApiOperation({
    summary: 'Deja la fórmula asignada exactamente a estos subtipos',
  })
  async setSubTypes(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignSubTypesDto,
  ): Promise<void> {
    try {
      await this.admin.setSubTypes(id, dto.designSubTypeIds ?? []);
    } catch (error) {
      asHttp(error);
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Baja lógica. Conserva el historial y los valores ya calculados en los diseños.',
  })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    try {
      await this.admin.softDelete(id);
    } catch (error) {
      asHttp(error);
    }
  }

  @Get('stale/sub-designs')
  @ApiOperation({
    summary:
      'Sub-diseños calculados con una versión que ya no es la vigente. Conservan sus valores.',
  })
  async stale(): Promise<
    Array<{ id: number; name: string; designId?: number; designName?: string }>
  > {
    const subDesigns = await this.recalculation.listStale();
    return subDesigns.map((subDesign) => ({
      id: subDesign.id,
      name: subDesign.name,
      designId: subDesign.design?.id,
      designName: subDesign.design?.name,
    }));
  }

  @Post('recalculate')
  @ApiOperation({
    summary:
      'Recalcula los sub-diseños indicados. Transaccional por sub-diseño: uno que falle no detiene el lote.',
  })
  recalculate(
    @Body() dto: { subDesignIds: number[] },
    @Req() request: Request,
  ) {
    const user = actingUser(request);
    return this.recalculation.recalculate(
      dto.subDesignIds ?? [],
      user.email ?? user.id,
    );
  }

  @Get('sub-designs/:subDesignId/last-recalculation')
  @ApiOperation({
    summary:
      'Qué celdas cambió el último recálculo de este sub-diseño y por qué',
  })
  lastRecalculation(@Param('subDesignId', ParseIntPipe) subDesignId: number) {
    return this.recalculation.lastRecalculation(subDesignId);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Deshace una baja lógica' })
  async undelete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.admin.restoreDeleted(id);
  }
}
