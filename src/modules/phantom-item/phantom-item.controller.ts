import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { File as MulterFile } from 'multer';
import { Response } from 'express';
import { extname } from 'path';
import { unlink } from 'fs/promises';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ValidationPipe } from '../../common/pipes/validation.pipe';
import { PhantomItemService } from './services/phantom-item.service';
import { PhantomItemImportService } from './services/phantom-item-import.service';
import { PhantomItemExportService } from './services/phantom-item-export.service';
import {
  CreatePhantomItemDto,
  UpdatePhantomItemDto,
} from './dtos/phantom-item.dto';
import {
  CreatePhantomItemComponentDto,
  UpdatePhantomItemComponentDto,
} from './dtos/phantom-item-component.dto';
import { PhantomItemsFiltersPaginatedDto } from './dtos/phantom-items-filters-paginated.dto';
import {
  PhantomItemDetailOutputDto,
  PhantomItemListOutputDto,
} from './dtos/phantom-item-output.dto';
import {
  PhantomItemImportMode,
  ImportResultDto,
} from './dtos/import-phantom-items.dto';

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Phantom Items')
@Controller('phantom-items')
export class PhantomItemController {
  constructor(
    private readonly phantomItemService: PhantomItemService,
    private readonly importService: PhantomItemImportService,
    private readonly exportService: PhantomItemExportService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.DESIGN, Role.NORM)
  @ApiOperation({ summary: 'Paginated list of phantom items' })
  @ApiResponse({ status: 200, type: PhantomItemListOutputDto })
  async findAll(
    @Query(ValidationPipe) filters: PhantomItemsFiltersPaginatedDto,
  ): Promise<PhantomItemListOutputDto> {
    return this.phantomItemService.findAllPaginated(filters);
  }

  @Get('columns')
  @Roles(Role.ADMIN, Role.DESIGN, Role.NORM)
  @ApiOperation({
    summary: 'Expected columns of the import template',
  })
  getColumns() {
    return this.importService.getExpectedColumns();
  }

  @Get('template')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Downloads the empty import template' })
  async downloadTemplate(@Res() res: Response): Promise<void> {
    const buffer = await this.exportService.buildTemplate();
    this.sendWorkbook(res, buffer, 'phantom-items-template.xlsx');
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.DESIGN, Role.NORM)
  @ApiOperation({ summary: 'Exports the catalog in the template format' })
  async export(
    @Query(ValidationPipe) filters: PhantomItemsFiltersPaginatedDto,
    @Query('ids') ids: string,
    @Res() res: Response,
  ): Promise<void> {
    const parsedIds = ids
      ? ids
          .split(',')
          .map((id) => Number.parseInt(id.trim(), 10))
          .filter((id) => Number.isInteger(id))
      : undefined;

    const buffer = await this.exportService.export(filters, parsedIds);
    this.sendWorkbook(res, buffer, 'phantom-items.xlsx');
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DESIGN, Role.NORM)
  @ApiOperation({ summary: 'Detail of a phantom item with its components' })
  @ApiResponse({ status: 200, type: PhantomItemDetailOutputDto })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PhantomItemDetailOutputDto> {
    return this.phantomItemService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Creates a phantom item with its components' })
  @ApiResponse({ status: 201, type: PhantomItemDetailOutputDto })
  async create(
    @Body(ValidationPipe) dto: CreatePhantomItemDto,
  ): Promise<PhantomItemDetailOutputDto> {
    return this.phantomItemService.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Edits a phantom item. If components is sent, replaces the list.',
  })
  @ApiResponse({ status: 200, type: PhantomItemDetailOutputDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: UpdatePhantomItemDto,
  ): Promise<PhantomItemDetailOutputDto> {
    return this.phantomItemService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-deletes the phantom item and its components' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.phantomItemService.remove(id);
  }

  @Post(':id/components')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Adds a component at the end of the list' })
  async addComponent(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: CreatePhantomItemComponentDto,
  ): Promise<PhantomItemDetailOutputDto> {
    return this.phantomItemService.addComponent(id, dto);
  }

  @Put('components/:componentId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Edits a component' })
  async updateComponent(
    @Param('componentId', ParseIntPipe) componentId: number,
    @Body(ValidationPipe) dto: UpdatePhantomItemComponentDto,
  ): Promise<PhantomItemDetailOutputDto> {
    return this.phantomItemService.updateComponent(componentId, dto);
  }

  @Delete('components/:componentId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-deletes a component' })
  async removeComponent(
    @Param('componentId', ParseIntPipe) componentId: number,
  ): Promise<void> {
    await this.phantomItemService.removeComponent(componentId);
  }

  @Post('import')
  @Roles(Role.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Imports phantom items from a .xlsx. With dryRun=true validates without writing.',
  })
  @ApiResponse({ status: 201, type: ImportResultDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, callback) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(
            null,
            `phantom-items-${unique}${extname(file.originalname)}`,
          );
        },
      }),
      limits: { fileSize: MAX_IMPORT_FILE_SIZE },
      fileFilter: (_req, file, callback) => {
        const isXlsx =
          extname(file.originalname).toLowerCase() === '.xlsx' &&
          (file.mimetype === XLSX_MIME ||
            file.mimetype === 'application/octet-stream');

        if (!isXlsx) {
          return callback(
            new BadRequestException({
              message: 'Validation failed',
              errors: { file: ['Only .xlsx files are allowed.'] },
            }),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async import(
    @UploadedFile() file: MulterFile,
    @Query('mode') mode?: PhantomItemImportMode,
    @Query('dryRun') dryRun?: string,
  ): Promise<ImportResultDto> {
    if (!file) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { file: ['A .xlsx file must be attached.'] },
      });
    }

    const resolvedMode =
      mode === PhantomItemImportMode.UPSERT
        ? PhantomItemImportMode.UPSERT
        : PhantomItemImportMode.CREATE;

    try {
      return await this.importService.import(
        file.path,
        resolvedMode,
        dryRun === 'true' || dryRun === '1',
      );
    } finally {
      // The uploaded file is temporary: nothing stays on disk either way
      await unlink(file.path).catch(() => undefined);
    }
  }

  private sendWorkbook(
    res: Response,
    buffer: ArrayBuffer,
    filename: string,
  ): void {
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    });
    res.end(Buffer.from(buffer));
  }
}
