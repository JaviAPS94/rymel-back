import { Module } from '@nestjs/common';
import { SemiFinishedService } from './semiFinished.service';
import { SemiFinishedController } from './semiFinished.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SemiFinished } from './entities/semiFinished.entity';
import { BillOfMaterialsNode } from '../bill-of-materials/entities/bill-of-materials-node.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SemiFinished, BillOfMaterialsNode])],
  providers: [SemiFinishedService],
  controllers: [SemiFinishedController],
})
export class SemiFinishedModule {}
