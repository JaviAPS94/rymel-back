import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { DesignTypeService } from './services/design-type.service';
import { DesignSubTypeService } from './services/design-subtype.service';
import { DesignTypeOutputDto } from './dtos/design-type-output.dto';
import { DesignSubTypeOutputDto } from './dtos/design-subtype-output.dto';
import { DesignSubTypeWithFunctionsDto } from './dtos/design-subtype-with-functions.dto';
import { TemplateResponseDto } from './dtos/template-response.dto';
import { TemplateService } from './services/template.service';
import { CreateDesignDto } from './dtos/create-desing.dto';
import { DesignService } from './services/design.service';
import { ValidationPipe } from '../../common/pipes/validation.pipe';
import { DesignFiltersPaginatedDto } from './dtos/designs-filters-paginated.dto';
import { DesignResponseDto } from './dtos/design-response.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { TemplateType } from '../../common/enums';

@ApiTags('Design')
@Controller('design')
export class DesignController {
  constructor(
    private readonly designTypeService: DesignTypeService,
    private readonly designSubTypeService: DesignSubTypeService,
    private readonly templateService: TemplateService,
    private readonly designService: DesignService,
  ) {}

  @Get('/types')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The records have been successfully retrieved.',
    type: DesignTypeOutputDto,
    isArray: true,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getAllDesignTypes(): Promise<DesignTypeOutputDto[]> {
    try {
      const designTypes = await this.designTypeService.findAll();
      return designTypes.map(
        (designType) => new DesignTypeOutputDto(designType),
      );
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/types/:id')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The record has been successfully retrieved.',
    type: DesignTypeOutputDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Design type not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getDesignTypeById(
    @Param('id') id: number,
  ): Promise<DesignTypeOutputDto> {
    try {
      const designType = await this.designTypeService.findById(id);
      return new DesignTypeOutputDto(designType);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/subtypes')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The records have been successfully retrieved.',
    type: DesignSubTypeOutputDto,
    isArray: true,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getAllDesignSubTypes(): Promise<DesignSubTypeOutputDto[]> {
    try {
      const designSubTypes = await this.designSubTypeService.findAll();
      return designSubTypes.map(
        (designSubType) => new DesignSubTypeOutputDto(designSubType),
      );
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/subtypes/by-type/:typeId')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The records have been successfully retrieved.',
    type: DesignSubTypeOutputDto,
    isArray: true,
  })
  @ApiResponse({
    status: 404,
    description: 'Design type not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getDesignSubTypesByTypeId(
    @Param('typeId') typeId: number,
  ): Promise<DesignSubTypeOutputDto[]> {
    try {
      const designSubTypes =
        await this.designSubTypeService.findByTypeId(typeId);
      return designSubTypes.map(
        (designSubType) => new DesignSubTypeOutputDto(designSubType),
      );
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/subtypes/:id')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The record has been successfully retrieved.',
    type: DesignSubTypeOutputDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Design subtype not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getDesignSubTypeById(
    @Param('id') id: number,
  ): Promise<DesignSubTypeOutputDto> {
    try {
      const designSubType = await this.designSubTypeService.findById(id);
      return new DesignSubTypeOutputDto(designSubType);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/subtypes/:id/with-functions')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description:
      'The record has been successfully retrieved with its functions.',
    type: DesignSubTypeWithFunctionsDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Design subtype not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getDesignSubTypeByIdWithFunctions(
    @Param('id') id: number,
  ): Promise<DesignSubTypeWithFunctionsDto> {
    try {
      const designSubType =
        await this.designSubTypeService.findByIdWithFunctions(id);
      return new DesignSubTypeWithFunctionsDto(designSubType);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/templates/:subTypeId')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The templates for the specified subtype have been retrieved.',
    type: TemplateResponseDto,
    isArray: true,
  })
  @ApiResponse({
    status: 404,
    description: 'Design subtype not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getTemplatesBySubTypeId(
    @Param('subTypeId') subTypeId: number,
    @Query('type') type?: TemplateType,
  ): Promise<TemplateResponseDto[]> {
    try {
      const templateType = type || TemplateType.DESIGN;
      const templateBySubType = await this.templateService.findBySubTypeId(
        subTypeId,
        templateType,
      );
      if (!templateBySubType) {
        throw new HttpException('Template not found', 404);
      }

      return templateBySubType.map(
        (template) => new TemplateResponseDto(template),
      );
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Post()
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 201,
    description: 'Design created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed. Invalid input data.',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Validation failed',
        },
        errors: {
          type: 'object',
          example: {
            name: ['name should not be empty', 'name must be a string'],
            code: ['code should not be empty', 'code must be a string'],
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async createDesign(
    @Body(ValidationPipe) createDesignDto: CreateDesignDto,
  ): Promise<{ id: number }> {
    try {
      const design = await this.designService.createDesign(createDesignDto);
      return design;
    } catch (error) {
      throw new HttpException(error.message, error.getStatus());
    }
  }

  @Put('/:id')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'Design updated successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed. Invalid input data.',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Validation failed',
        },
        errors: {
          type: 'object',
          example: {
            name: ['name should not be empty', 'name must be a string'],
            code: ['code should not be empty', 'code must be a string'],
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Design not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async updateDesign(
    @Param('id') id: number,
    @Body(ValidationPipe) updateDesignDto: CreateDesignDto,
  ): Promise<void> {
    try {
      await this.designService.updateDesign(id, updateDesignDto);
    } catch (error) {
      throw new HttpException(error.message, error.getStatus());
    }
  }

  @Post('/by-filters-paginated')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The records have been successfully retrieved.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getAllDesignsPaginated(
    @Body() designFiltersPaginatedDto: DesignFiltersPaginatedDto,
  ) {
    try {
      const designs = await this.designService.findAllPaginated(
        designFiltersPaginatedDto,
      );
      return designs;
    } catch (error) {
      console.error('Error in getAllDesignsPaginated:', error);
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/by-id/:id')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The record has been successfully retrieved.',
  })
  @ApiResponse({
    status: 404,
    description: 'Design not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async getDesignById(@Param('id') id: number): Promise<DesignResponseDto> {
    try {
      const design = await this.designService.findById(id);
      return new DesignResponseDto(design);
    } catch (error) {
      console.error('Error in getDesignById:', error);
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Delete('/:id')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'Design deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Design not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async deleteById(@Param('id') id: number): Promise<void> {
    try {
      await this.designService.deleteById(id);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }
}
