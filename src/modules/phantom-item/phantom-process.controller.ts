import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ValidationPipe } from '../../common/pipes/validation.pipe';
import { PhantomProcessService } from './services/phantom-process.service';
import {
  PhantomProcessColumnsDto,
  PhantomProcessNameDto,
  PhantomProcessOrderDto,
  PhantomProcessReferenceSeparatorDto,
} from './dtos/phantom-process.dto';

/**
 * Plant processes of the phantom items, their families and their columns.
 *
 * Its own path and not `/phantom-items/processes`: the phantom item
 * controller has `GET :id`, and the two would collide.
 */
@ApiTags('Phantom Processes')
@Controller('phantom-processes')
export class PhantomProcessController {
  constructor(private readonly processes: PhantomProcessService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DESIGN, Role.NORM)
  @ApiOperation({
    summary: 'Processes in order, with their columns and families',
  })
  list() {
    return this.processes.list();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Creates a process at the end, with the catalog as its columns',
  })
  create(@Body(ValidationPipe) dto: PhantomProcessNameDto) {
    return this.processes.create(dto.name);
  }

  @Put('order')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sets the order of every process' })
  reorder(@Body(ValidationPipe) dto: PhantomProcessOrderDto) {
    return this.processes.reorder(dto.ids);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Renames a process' })
  rename(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: PhantomProcessNameDto,
  ) {
    return this.processes.rename(id, dto.name);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Removes a process without phantom items' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.processes.remove(id);
  }

  @Put(':id/reference-separator')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      "Sets the process's reference rule: nothing or a space before the kVA",
  })
  setReferenceSeparator(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: PhantomProcessReferenceSeparatorDto,
  ) {
    return this.processes.setReferenceSeparator(id, dto.referenceSeparator);
  }

  @Put(':id/columns')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Replaces the columns of a process, in order' })
  setColumns(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: PhantomProcessColumnsDto,
  ) {
    return this.processes.setColumns(id, dto.columns);
  }

  @Post(':id/families')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Creates a family in a process' })
  createFamily(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: PhantomProcessNameDto,
  ) {
    return this.processes.createFamily(id, dto.name);
  }

  @Put('families/:familyId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Renames a family' })
  renameFamily(
    @Param('familyId', ParseIntPipe) familyId: number,
    @Body(ValidationPipe) dto: PhantomProcessNameDto,
  ) {
    return this.processes.renameFamily(familyId, dto.name);
  }
}
