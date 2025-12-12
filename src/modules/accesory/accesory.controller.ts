import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AccesoryService } from './accesory.service';
import { GetAccesotyDto } from './dtos/get-accesory.dto';
import { OutputAccesoryDto } from './dtos/output-contry.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('accesory')
export class AccesoryController {
  constructor(private readonly accesoryService: AccesoryService) {}

  @Post('/by-name')
  @Roles(Role.NORM, Role.ADMIN, Role.DESIGN)
  @HttpCode(200)
  async getAccesories(@Body() getAccesoryDto: GetAccesotyDto) {
    const response = await this.accesoryService.getAccesories(getAccesoryDto);
    return response.result.map((accesory) =>
      OutputAccesoryDto.fromEntity(accesory),
    );
  }
}
