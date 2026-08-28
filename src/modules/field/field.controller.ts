import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ElementField, FieldService } from './field.service';

@ApiTags('Field')
@Controller('field')
export class FieldController {
  constructor(private readonly fieldService: FieldService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DESIGN, Role.NORM)
  @ApiOperation({
    summary: 'Campos del elemento definidos, sin duplicar claves',
  })
  @ApiResponse({ status: 200 })
  findAll(): Promise<ElementField[]> {
    return this.fieldService.findAll();
  }

  @Get('by-design-subtype/:id')
  @Roles(Role.ADMIN, Role.DESIGN)
  @ApiOperation({
    summary:
      'Campos que alcanzan a un subtipo de diseño, para ofrecer los elementKey',
  })
  @ApiResponse({ status: 200 })
  findByDesignSubType(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ElementField[]> {
    return this.fieldService.findByDesignSubType(id);
  }
}
