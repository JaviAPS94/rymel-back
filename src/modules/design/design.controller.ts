import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { DesignTypeService } from './services/design-type.service';
import { DesignSubTypeService } from './services/design-subtype.service';
import { DesignTypeOutputDto } from './dtos/design-type-output.dto';
import { DesignSubTypeOutputDto } from './dtos/design-subtype-output.dto';
import { DesignSubTypeWithFunctionsDto } from './dtos/design-subtype-with-functions.dto';
import { DesignFunctionOutputDto } from './dtos/design-function-output.dto';
import { TemplateResponseDto } from './dtos/template-response.dto';
import { TemplateService } from './services/template.service';
import { CreateDesignDto } from './dtos/create-desing.dto';
import { DesignService } from './services/design.service';
import { ValidationPipe } from '../../common/pipes/validation.pipe';
import { DesignFiltersPaginatedDto } from './dtos/designs-filters-paginated.dto';
import {
  DesignResponseDto,
  SubDesignResponseDto,
} from './dtos/design-response.dto';
import { Design } from './entities/design.entity';

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
      return designTypes.map((designType) => {
        const designTypeDto = new DesignTypeOutputDto();
        designTypeDto.id = designType.id;
        designTypeDto.name = designType.name;
        return designTypeDto;
      });
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/types/:id')
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
      const designTypeDto = new DesignTypeOutputDto();
      designTypeDto.id = designType.id;
      designTypeDto.name = designType.name;
      return designTypeDto;
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/subtypes')
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
      return designSubTypes.map((designSubType) => {
        const designSubTypeDto = new DesignSubTypeOutputDto();
        designSubTypeDto.id = designSubType.id;
        designSubTypeDto.name = designSubType.name;
        designSubTypeDto.designTypeId = designSubType.designType?.id;
        designSubTypeDto.designTypeName = designSubType.designType?.name;
        designSubTypeDto.code = designSubType.code;
        return designSubTypeDto;
      });
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/subtypes/by-type/:typeId')
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
      return designSubTypes.map((designSubType) => {
        const designSubTypeDto = new DesignSubTypeOutputDto();
        designSubTypeDto.id = designSubType.id;
        designSubTypeDto.name = designSubType.name;
        designSubTypeDto.designTypeId = designSubType.designType?.id;
        designSubTypeDto.designTypeName = designSubType.designType?.name;
        designSubTypeDto.code = designSubType.code;
        return designSubTypeDto;
      });
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/subtypes/:id')
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
      const designSubTypeDto = new DesignSubTypeOutputDto();
      designSubTypeDto.id = designSubType.id;
      designSubTypeDto.name = designSubType.name;
      designSubTypeDto.designTypeId = designSubType.designType?.id;
      designSubTypeDto.designTypeName = designSubType.designType?.name;
      return designSubTypeDto;
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/subtypes/:id/with-functions')
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

      const dto = new DesignSubTypeWithFunctionsDto();
      dto.id = designSubType.id;
      dto.name = designSubType.name;
      dto.designTypeId = designSubType.designType?.id;
      dto.designTypeName = designSubType.designType?.name;

      // Extract and map functions from the designSubTypeFunctions relation
      dto.designFunctions =
        designSubType.designSubTypeFunctions?.map((relation) => {
          const functionDto = new DesignFunctionOutputDto();
          const func = relation.designFunction;
          functionDto.id = func.id;
          functionDto.name = func.name;
          functionDto.expression = func.expression;
          functionDto.variables = func.variables;
          functionDto.description = func.description;
          functionDto.code = func.code;
          functionDto.constants = JSON.parse(func.constants || '{}');
          return functionDto;
        }) || [];

      return dto;
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Get('/templates/:subTypeId')
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
  ): Promise<TemplateResponseDto[]> {
    try {
      const templateBySubType =
        await this.templateService.findBySubTypeId(subTypeId);
      if (!templateBySubType) {
        throw new HttpException('Template not found', 404);
      }

      return templateBySubType.map((template) => {
        const templateDto = new TemplateResponseDto();
        templateDto.id = template.id;
        templateDto.name = template.name;
        templateDto.code = template.code;
        templateDto.description = template.description;
        templateDto.cellsStyles = JSON.parse(template.cellsStyles);
        templateDto.cells = JSON.parse(template.cells);
        return templateDto;
      });
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Post()
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

      const designDto = new DesignResponseDto();
      designDto.id = design.id;
      designDto.name = design.name;
      designDto.code = design.code;
      designDto.createdAt = design.createdAt;
      designDto.updatedAt = design.updatedAt;
      designDto.deletedAt = design.deletedAt;
      designDto.designSubType = design.designSubType;
      designDto.designElements = design.designElements;

      designDto.subDesigns = (design.subDesigns || []).map((subDesign) => {
        const subDesignDto = new SubDesignResponseDto();
        subDesignDto.id = subDesign.id;
        subDesignDto.name = subDesign.name;
        subDesignDto.code = subDesign.code;
        subDesignDto.createdAt = subDesign.createdAt;
        subDesignDto.updatedAt = subDesign.updatedAt;
        subDesignDto.deletedAt = subDesign.deletedAt;
        subDesignDto.data = JSON.parse(subDesign.data);

        return subDesignDto;
      });

      return designDto;
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }
}
