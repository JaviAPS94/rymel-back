import e from 'express';
import { DesignElement } from '../entities/design-element.entity';
import { DesignSubType } from '../entities/design-subtype.entity';
import { TemplateResponseDto } from './template-response.dto';

export class DesignResponseDto {
  id: number;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  designSubType: DesignSubType;
  designElements: DesignElement[];
  subDesigns: SubDesignResponseDto[];
}

export class SubDesignResponseDto {
  id: number;
  name: string;
  code: string;
  data: Map<unknown, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
}
