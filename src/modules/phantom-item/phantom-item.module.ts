import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhantomItem } from './entities/phantom-item.entity';
import { PhantomItemComponent } from './entities/phantom-item-component.entity';
import { PhantomItemController } from './phantom-item.controller';
import { PhantomItemService } from './services/phantom-item.service';
import { PhantomItemImportService } from './services/phantom-item-import.service';
import { PhantomItemExportService } from './services/phantom-item-export.service';

@Module({
  imports: [TypeOrmModule.forFeature([PhantomItem, PhantomItemComponent])],
  controllers: [PhantomItemController],
  providers: [
    PhantomItemService,
    PhantomItemImportService,
    PhantomItemExportService,
  ],
  exports: [PhantomItemService],
})
export class PhantomItemModule {}
