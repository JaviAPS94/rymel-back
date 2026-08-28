import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { DesignFunctionService } from './services/design-function.service';
import { CreateDesignFunctionDto } from './dtos/create-design-function.dto';
import { CalculateFunctionDto } from './dtos/calculate-function.dto';
import { CalculateFunctionResponseDto } from './dtos/calculate-function-response.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { DesignRecalculationService } from './services/design-recalculation.service';
import { RecalculationNoticeDto } from './dtos/recalculation-notice.dto';

@ApiTags('Design Functions')
@Controller('design-functions')
export class DesignFunctionController {
  constructor(
    private readonly designFunctionService: DesignFunctionService,
    private readonly recalculationService: DesignRecalculationService,
  ) {}

  /**
   * Qué le pasó a los valores de esta hoja.
   *
   * La consume el diseñador, no el administrador, así que va aquí y no bajo
   * `admin/`: quien abre un diseño necesita saber si los números que ve son
   * los que dejó.
   */
  @Get('sub-designs/:subDesignId/recalculation-notice')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({ status: 200, type: RecalculationNoticeDto })
  recalculationNotice(
    @Param('subDesignId', ParseIntPipe) subDesignId: number,
  ): Promise<RecalculationNoticeDto> {
    return this.recalculationService.recalculationNotice(
      subDesignId,
    ) as Promise<RecalculationNoticeDto>;
  }

  @Post()
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 201,
    description: 'The design function has been successfully created.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async createDesignFunction(
    @Body() createDesignFunctionDto: CreateDesignFunctionDto,
  ): Promise<void> {
    try {
      await this.designFunctionService.create(createDesignFunctionDto);
    } catch (error) {
      console.error('Error creating design function:', error);
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Post('calculate')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiResponse({
    status: 200,
    description: 'The functions have been successfully calculated.',
    type: CalculateFunctionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request.',
  })
  @ApiResponse({
    status: 404,
    description: 'Design function not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async calculateDesignFunctions(
    @Body() calculateFunctionDto: CalculateFunctionDto,
  ): Promise<CalculateFunctionResponseDto> {
    try {
      const results = await this.designFunctionService.calculateFunctions(
        calculateFunctionDto.functions,
      );
      return { results };
    } catch (error) {
      console.error('Error calculating design functions:', error);
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }
}
