import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ValidationPipe } from '../../common/pipes/validation.pipe';
import { DesignCodePowerLetterService } from './services/design-code-power-letter.service';
import { DesignCodePrimaryTensionLetterService } from './services/design-code-primary-tension-letter.service';
import { DesignCodeSecondaryTensionLetterService } from './services/design-code-secondary-tension-letter.service';
import { DesignCodeSapSegmentMappingService } from './services/design-code-sap-segment-mapping.service';
import { DesignCodeSuffixFormatService } from './services/design-code-suffix-format.service';
import {
  CreatePowerLetterDto,
  UpdatePowerLetterDto,
} from './dtos/power-letter.dto';
import {
  CreateTensionLetterDto,
  UpdateTensionLetterDto,
} from './dtos/tension-letter.dto';
import {
  CreateSapSegmentMappingDto,
  UpdateSapSegmentMappingDto,
} from './dtos/sap-segment-mapping.dto';
import {
  CreateSuffixFormatDto,
  UpdateSuffixFormatDto,
} from './dtos/suffix-format.dto';

@ApiTags('DesignCodeRules')
@Controller('design-code-rules')
@Roles(Role.ADMIN)
export class DesignCodeRulesController {
  constructor(
    private readonly powerLetterService: DesignCodePowerLetterService,
    private readonly primaryTensionLetterService: DesignCodePrimaryTensionLetterService,
    private readonly secondaryTensionLetterService: DesignCodeSecondaryTensionLetterService,
    private readonly sapSegmentMappingService: DesignCodeSapSegmentMappingService,
    private readonly suffixFormatService: DesignCodeSuffixFormatService,
  ) {}

  // ---- Potencia -> letra ----

  @Get('power-letters')
  getPowerLetters() {
    return this.powerLetterService.findAll();
  }

  @Post('power-letters')
  createPowerLetter(@Body(ValidationPipe) dto: CreatePowerLetterDto) {
    return this.powerLetterService.create(dto);
  }

  @Put('power-letters/:id')
  async updatePowerLetter(
    @Param('id') id: number,
    @Body(ValidationPipe) dto: UpdatePowerLetterDto,
  ) {
    try {
      return await this.powerLetterService.update(id, dto);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Delete('power-letters/:id')
  async deletePowerLetter(@Param('id') id: number) {
    try {
      await this.powerLetterService.remove(id);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  // ---- Tensión primaria -> letra ----

  @Get('primary-tension-letters')
  getPrimaryTensionLetters() {
    return this.primaryTensionLetterService.findAll();
  }

  @Post('primary-tension-letters')
  createPrimaryTensionLetter(
    @Body(ValidationPipe) dto: CreateTensionLetterDto,
  ) {
    return this.primaryTensionLetterService.create(dto);
  }

  @Put('primary-tension-letters/:id')
  async updatePrimaryTensionLetter(
    @Param('id') id: number,
    @Body(ValidationPipe) dto: UpdateTensionLetterDto,
  ) {
    try {
      return await this.primaryTensionLetterService.update(id, dto);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Delete('primary-tension-letters/:id')
  async deletePrimaryTensionLetter(@Param('id') id: number) {
    try {
      await this.primaryTensionLetterService.remove(id);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  // ---- Tensión secundaria -> letra ----

  @Get('secondary-tension-letters')
  getSecondaryTensionLetters() {
    return this.secondaryTensionLetterService.findAll();
  }

  @Post('secondary-tension-letters')
  createSecondaryTensionLetter(
    @Body(ValidationPipe) dto: CreateTensionLetterDto,
  ) {
    return this.secondaryTensionLetterService.create(dto);
  }

  @Put('secondary-tension-letters/:id')
  async updateSecondaryTensionLetter(
    @Param('id') id: number,
    @Body(ValidationPipe) dto: UpdateTensionLetterDto,
  ) {
    try {
      return await this.secondaryTensionLetterService.update(id, dto);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Delete('secondary-tension-letters/:id')
  async deleteSecondaryTensionLetter(@Param('id') id: number) {
    try {
      await this.secondaryTensionLetterService.remove(id);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  // ---- Mapeo de posiciones de segmentos SAP ----

  @Get('sap-segment-mappings')
  getSapSegmentMappings() {
    return this.sapSegmentMappingService.findAll();
  }

  @Post('sap-segment-mappings')
  createSapSegmentMapping(
    @Body(ValidationPipe) dto: CreateSapSegmentMappingDto,
  ) {
    return this.sapSegmentMappingService.create(dto);
  }

  @Put('sap-segment-mappings/:id')
  async updateSapSegmentMapping(
    @Param('id') id: number,
    @Body(ValidationPipe) dto: UpdateSapSegmentMappingDto,
  ) {
    try {
      return await this.sapSegmentMappingService.update(id, dto);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Delete('sap-segment-mappings/:id')
  async deleteSapSegmentMapping(@Param('id') id: number) {
    try {
      await this.sapSegmentMappingService.remove(id);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  // ---- Formatos de sufijo de desambiguación ----

  @Get('suffix-formats')
  getSuffixFormats() {
    return this.suffixFormatService.findAll();
  }

  @Post('suffix-formats')
  createSuffixFormat(@Body(ValidationPipe) dto: CreateSuffixFormatDto) {
    return this.suffixFormatService.create(dto);
  }

  @Put('suffix-formats/:id')
  async updateSuffixFormat(
    @Param('id') id: number,
    @Body(ValidationPipe) dto: UpdateSuffixFormatDto,
  ) {
    try {
      return await this.suffixFormatService.update(id, dto);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }

  @Delete('suffix-formats/:id')
  async deleteSuffixFormat(@Param('id') id: number) {
    try {
      await this.suffixFormatService.remove(id);
    } catch (error) {
      throw new HttpException(error.message, error?.getStatus() ?? 500);
    }
  }
}
