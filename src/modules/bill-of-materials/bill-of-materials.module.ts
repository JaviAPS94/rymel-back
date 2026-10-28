import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillOfMaterials } from './entities/bill-of-materials.entity';
import { BillOfMaterialsNode } from './entities/bill-of-materials-node.entity';
import { BillOfMaterialsService } from './bill-of-materials.service';
import { BillOfMaterialsController } from './bill-of-materials.controller';
import { SemiFinished } from '../semi-finished/entities/semiFinished.entity';
import { BillOfMaterialsNodePhantomFamily } from './entities/bill-of-materials-node-phantom-family.entity';
import { BillOfMaterialsProductType } from './entities/bill-of-materials-product-type.entity';
import { PhantomFamily } from '../phantom-item/entities/phantom-family.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillOfMaterials,
      BillOfMaterialsNode,
      SemiFinished,
      BillOfMaterialsNodePhantomFamily,
      BillOfMaterialsProductType,
      PhantomFamily,
    ]),
  ],
  providers: [BillOfMaterialsService],
  controllers: [BillOfMaterialsController],
})
export class BillOfMaterialsModule {}
