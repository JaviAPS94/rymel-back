import { PartialType } from '@nestjs/swagger';
import { CreateSemiFinishedDto } from './create-semi-finished.dto';

export class UpdateSemiFinishedDto extends PartialType(CreateSemiFinishedDto) {}
