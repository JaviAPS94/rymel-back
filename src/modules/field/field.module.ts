import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldService } from './field.service';
import { FieldController } from './field.controller';
import { Field } from './entities/field.entity';
import { SubType } from '../subtype/entities/subtype.entity';
import { DesignSubType } from '../design/entities/design-subtype.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Field, SubType, DesignSubType])],
  providers: [FieldService],
  controllers: [FieldController],
  exports: [FieldService],
})
export class FieldModule {}
