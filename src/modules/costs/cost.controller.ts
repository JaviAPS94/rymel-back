import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Cost')
@Controller('cost')
export class CostController {}
