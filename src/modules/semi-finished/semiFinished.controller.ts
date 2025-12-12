import { Controller, Get } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { SemiFinishedService } from './semiFinished.service';
import { SemiFinished } from './entities/semiFinished.entity';
import { SemiFinishedOutputDto } from './dtos/semiFinished-output.dto';
import { Role } from '../auth/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('SemiFinished')
@Controller('semi-finished')
export class SemiFinishedController {
  constructor(private readonly semiFinishedService: SemiFinishedService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DESIGN, Role.NORM)
  @ApiResponse({
    status: 200,
    description: 'The records have been successfully retrieved.',
    type: SemiFinishedOutputDto,
    isArray: true,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async findAll(): Promise<SemiFinishedOutputDto[]> {
    const semiFinished: SemiFinished[] =
      await this.semiFinishedService.findAll();
    return semiFinished.map((item) => {
      const semiFinishedDto = new SemiFinishedOutputDto();
      semiFinishedDto.id = item.id;
      semiFinishedDto.name = item.name;
      semiFinishedDto.code = item.code;
      return semiFinishedDto;
    });
  }
}
