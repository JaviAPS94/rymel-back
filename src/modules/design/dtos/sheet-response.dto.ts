import { Sheet } from '../entities/sheet.entity';

export class SheetResponseDto {
  name: string;
  cells: Map<unknown, unknown>;
  cellsStyles?: Map<unknown, unknown>;

  constructor(sheet: Sheet) {
    this.name = sheet.name;
    this.cells = JSON.parse(sheet.cells || '{}');
    this.cellsStyles = JSON.parse(sheet.cellsStyles || '{}');
  }
}
