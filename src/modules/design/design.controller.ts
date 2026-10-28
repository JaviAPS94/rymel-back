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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
import { DesignCodeGenerationService } from '../design-code-rules/services/design-code-generation.service';
import {
  DesignCodeGenerationResponseDto,
  GenerateDesignCodeDto,
} from '../design-code-rules/dtos/generate-design-code.dto';
import { DesignBomAdjustmentService } from './services/design-bom-adjustment.service';
import { DesignBomReviewService } from './services/design-bom-review.service';
import {
  DesignBomReviewFiltersDto,
  DesignBomReviewPageDto,
} from './dtos/design-bom-review.dto';
import {
  DesignBomAdjustmentDto,
  SaveDesignBomAdjustmentDto,
} from './dtos/design-bom-adjustment.dto';

@ApiTags('Design')
@Controller('design')
export class DesignController {
  constructor(
    private readonly designTypeService: DesignTypeService,
    private readonly designSubTypeService: DesignSubTypeService,
    private readonly templateService: TemplateService,
    private readonly designService: DesignService,
    private readonly designCodeGenerationService: DesignCodeGenerationService,
    private readonly designBomAdjustmentService: DesignBomAdjustmentService,
    private readonly designBomReviewService: DesignBomReviewService,
  ) {}

  @Get('/code/is-available')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'Returns whether the code is available.',
  })
  async isDesignCodeAvailable(
    @Query('code') code: string,
  ): Promise<{ isAvailable: boolean }> {
    try {
      const isAvailable =
        await this.designCodeGenerationService.isCodeAvailable(code);
      return { isAvailable };
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Post('/code/generate')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The design code has been successfully generated.',
    type: DesignCodeGenerationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing rule configuration or invalid SAP reference.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async generateDesignCode(
    @Body(ValidationPipe) generateDesignCodeDto: GenerateDesignCodeDto,
  ): Promise<DesignCodeGenerationResponseDto> {
    try {
      const result = await this.designCodeGenerationService.generate(
        generateDesignCodeDto,
      );
      return new DesignCodeGenerationResponseDto(result);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

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

  @Post('/bom-review')
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 200,
    description:
      'Designs with the state of their bill of materials, for the admin to review.',
    type: DesignBomReviewPageDto,
  })
  async getBomReview(
    @Body(ValidationPipe) filters: DesignBomReviewFiltersDto,
  ): Promise<DesignBomReviewPageDto> {
    try {
      return await this.designBomReviewService.list(filters);
    } catch (error) {
      console.error('Error in getBomReview:', error);
      throw new HttpException(error.message, error?.getStatus?.() ?? 500);
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

  @Get('/:id/bom-adjustment')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The saved BOM adjustment of the design.',
    type: DesignBomAdjustmentDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Design not found, or it has no BOM adjustment.',
  })
  async getBomAdjustment(
    @Param('id') id: number,
  ): Promise<DesignBomAdjustmentDto> {
    try {
      const adjustment = await this.designBomAdjustmentService.find(id);
      return new DesignBomAdjustmentDto(adjustment);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Put('/:id/bom-adjustment')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'BOM adjustment saved; replaces the previous one.',
    type: DesignBomAdjustmentDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Design not found.',
  })
  async saveBomAdjustment(
    @Param('id') id: number,
    @Body(ValidationPipe) dto: SaveDesignBomAdjustmentDto,
    @Req() request: Request,
  ): Promise<DesignBomAdjustmentDto> {
    try {
      const user = (request as Request & { user?: { email?: string } }).user;
      const adjustment = await this.designBomAdjustmentService.save(
        id,
        dto,
        user?.email,
      );
      return new DesignBomAdjustmentDto(adjustment);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Delete('/:id/bom-adjustment')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'BOM adjustment discarded.',
  })
  @ApiResponse({
    status: 404,
    description: 'Design not found, or it has no BOM adjustment.',
  })
  async deleteBomAdjustment(@Param('id') id: number): Promise<void> {
    try {
      await this.designBomAdjustmentService.remove(id);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }
}
