import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cost } from './entities/cost.entity';
import { SubCost } from './entities/sub-cost.entity';
import { CostController } from './cost.controller';
import { CostService } from './cost.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Cost, SubCost])],
  controllers: [CostController],
  providers: [CostService],
  exports: [CostService],
})
export class CostModule {}
