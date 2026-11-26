import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { BillOfMaterialsService } from './bill-of-materials.service';
import { CreateBillOfMaterialsDto } from './dtos/create-bill-of-materials.dto';
import { UpdateBillOfMaterialsDto } from './dtos/update-bill-of-materials.dto';
import { CreateBomNodeDto } from './dtos/create-bom-node.dto';
import { UpdateBomNodeDto } from './dtos/update-bom-node.dto';
import {
  AddNodePhantomFamiliesDto,
  SetBomProductTypesDto,
} from './dtos/bom-phantoms.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Bill of Materials')
@Controller('bill-of-materials')
export class BillOfMaterialsController {
  constructor(private readonly bomService: BillOfMaterialsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 201, description: 'BOM creado exitosamente.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(@Body() dto: CreateBillOfMaterialsDto) {
    try {
      return await this.bomService.create(dto);
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @Roles(Role.ADMIN, Role.NORM, Role.DESIGN)
  @ApiResponse({ status: 200, description: 'Lista paginada de BOMs.' })
  async findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    try {
      return await this.bomService.findAllPaginated(
        page ? Number(page) : 1,
        limit ? Number(limit) : 10,
      );
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('search')
  @Roles(Role.ADMIN, Role.NORM, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'BOM cuyo código es prefijo del código buscado.',
  })
  @ApiResponse({
    status: 404,
    description: 'No se encontró un BOM que coincida.',
  })
  async findByCode(@Query('code') code: string) {
    try {
      if (!code) {
        throw new HttpException(
          'El parámetro code es requerido',
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.bomService.findByCode(code);
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.NORM, Role.DESIGN)
  @ApiResponse({ status: 200, description: 'BOM con árbol completo.' })
  @ApiResponse({ status: 404, description: 'BOM no encontrado.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.bomService.findOne(id);
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 200, description: 'BOM actualizado.' })
  @ApiResponse({ status: 404, description: 'BOM no encontrado.' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBillOfMaterialsDto,
  ) {
    try {
      await this.bomService.update(id, dto);
      return { message: 'BOM actualizado exitosamente' };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 200, description: 'BOM eliminado.' })
  @ApiResponse({ status: 404, description: 'BOM no encontrado.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.bomService.remove(id);
      return { message: 'BOM eliminado exitosamente' };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/nodes')
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 201, description: 'Nodo agregado al árbol.' })
  @ApiResponse({ status: 404, description: 'BOM no encontrado.' })
  @ApiResponse({ status: 400, description: 'Nodo padre inválido.' })
  async addNode(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBomNodeDto,
  ) {
    try {
      return await this.bomService.addNode(id, dto);
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch('nodes/:nodeId')
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 200, description: 'Nodo actualizado.' })
  @ApiResponse({ status: 404, description: 'Nodo no encontrado.' })
  async updateNode(
    @Param('nodeId', ParseIntPipe) nodeId: number,
    @Body() dto: UpdateBomNodeDto,
  ) {
    try {
      await this.bomService.updateNode(nodeId, dto);
      return { message: 'Nodo actualizado exitosamente' };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('nodes/:nodeId')
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 200, description: 'Nodo y sus hijos eliminados.' })
  @ApiResponse({ status: 404, description: 'Nodo no encontrado.' })
  async removeNode(@Param('nodeId', ParseIntPipe) nodeId: number) {
    try {
      await this.bomService.removeNode(nodeId);
      return { message: 'Nodo y sus hijos eliminados exitosamente' };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id/product-types')
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 200, description: 'Tipos PT de la estructura.' })
  @ApiResponse({ status: 404, description: 'BOM no encontrado.' })
  async setProductTypes(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetBomProductTypesDto,
  ) {
    try {
      return {
        productTypes: await this.bomService.setProductTypes(id, dto.codes),
      };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/phantom-families/:familyId/items')
  @Roles(Role.ADMIN, Role.NORM, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'Fantasmas de la familia que ofrece la estructura.',
  })
  @ApiResponse({ status: 404, description: 'BOM no encontrado.' })
  async offeredPhantomItems(
    @Param('id', ParseIntPipe) id: number,
    @Param('familyId', ParseIntPipe) familyId: number,
  ) {
    try {
      return await this.bomService.offeredPhantomItems(id, familyId);
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('nodes/:nodeId/phantom-families')
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 201, description: 'Familias colgadas del nodo.' })
  @ApiResponse({ status: 400, description: 'Familia inexistente.' })
  @ApiResponse({ status: 409, description: 'El nodo ya tiene la familia.' })
  async addPhantomFamilies(
    @Param('nodeId', ParseIntPipe) nodeId: number,
    @Body() dto: AddNodePhantomFamiliesDto,
  ) {
    try {
      await this.bomService.addPhantomFamilies(nodeId, dto.familyIds);
      return { message: 'Familias agregadas al nodo' };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('node-phantom-families/:id')
  @Roles(Role.ADMIN, Role.NORM)
  @ApiResponse({ status: 200, description: 'Familia quitada del árbol.' })
  @ApiResponse({ status: 404, description: 'No encontrada.' })
  async removePhantomFamily(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.bomService.removePhantomFamily(id);
      return { message: 'Familia quitada del árbol' };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        error.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
