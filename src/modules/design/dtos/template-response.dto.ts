import { Template } from '../entities/template.entity';
import { SheetResponseDto } from './sheet-response.dto';

export class TemplateResponseDto {
  id: number;
  name: string;
  description?: string;
  code: string;
  sheets: SheetResponseDto[];

  constructor(template: Template) {
    this.id = template.id;
    this.name = template.name;
    this.code = template.code;
    this.description = template.description;
    this.sheets = (template.sheets || [])
      .filter((sheet) => !sheet.deletedAt)
      .sort((a, b) => a.order - b.order)
      .map((sheet) => new SheetResponseDto(sheet));
  }
}
