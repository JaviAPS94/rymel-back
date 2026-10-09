import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhantomItem } from './entities/phantom-item.entity';
import { PhantomItemComponent } from './entities/phantom-item-component.entity';
import { PhantomItemController } from './phantom-item.controller';
import { PhantomItemService } from './services/phantom-item.service';
import { PhantomItemImportService } from './services/phantom-item-import.service';
import { PhantomItemExportService } from './services/phantom-item-export.service';

import { PhantomProcess } from './entities/phantom-process.entity';
import { PhantomFamily } from './entities/phantom-family.entity';
import { PhantomProcessColumn } from './entities/phantom-process-column.entity';

import { PhantomProcessController } from './phantom-process.controller';
import { PhantomProcessService } from './services/phantom-process.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PhantomItem,
      PhantomItemComponent,
      PhantomProcess,
      PhantomFamily,
      PhantomProcessColumn,
    ]),
  ],
  controllers: [PhantomItemController, PhantomProcessController],
  providers: [
    PhantomItemService,
    PhantomItemImportService,
    PhantomItemExportService,
    PhantomProcessService,
  ],
  exports: [PhantomItemService],
})
export class PhantomItemModule {}
