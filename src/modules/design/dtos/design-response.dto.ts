import { DesignElement } from '../entities/design-element.entity';
import { DesignSubType } from '../entities/design-subtype.entity';
import { Design } from '../entities/design.entity';
import { SubDesign } from '../entities/sub-design.entity';
import { Cost } from '../../costs/entities/cost.entity';
import { SubCost } from '../../costs/entities/sub-cost.entity';

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
  cost: CostResponseDto | null;

  constructor(design: Design) {
    this.id = design.id;
    this.name = design.name;
    this.code = design.code;
    this.createdAt = design.createdAt;
    this.updatedAt = design.updatedAt;
    this.deletedAt = design.deletedAt;
    this.designSubType = design.designSubType;
    this.designElements = design.designElements;
    this.subDesigns = (design.subDesigns || []).map(
      (subDesign) => new SubDesignResponseDto(subDesign),
    );
    this.cost = design.cost ? new CostResponseDto(design.cost) : null;
  }
}

export class SubDesignResponseDto {
  id: number;
  name: string;
  code: string;
  data: Map<unknown, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;

  constructor(subDesign: SubDesign) {
    this.id = subDesign.id;
    this.name = subDesign.name;
    this.code = subDesign.code;
    this.createdAt = subDesign.createdAt;
    this.updatedAt = subDesign.updatedAt;
    this.deletedAt = subDesign.deletedAt;
    this.data = JSON.parse(subDesign.data || '{}');
  }
}

export class CostResponseDto {
  id: number;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  subCosts: SubCostResponseDto[];

  constructor(cost: Cost) {
    this.id = cost.id;
    this.name = cost.name;
    this.code = cost.code;
    this.createdAt = cost.createdAt;
    this.updatedAt = cost.updatedAt;
    this.deletedAt = cost.deletedAt;
    this.subCosts = (cost.subCosts || []).map(
      (subCost) => new SubCostResponseDto(subCost),
    );
  }
}

export class SubCostResponseDto {
  id: number;
  name: string;
  code: string;
  data: Map<unknown, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;

  constructor(subCost: SubCost) {
    this.id = subCost.id;
    this.name = subCost.name;
    this.code = subCost.code;
    this.createdAt = subCost.createdAt;
    this.updatedAt = subCost.updatedAt;
    this.deletedAt = subCost.deletedAt;
    this.data = JSON.parse(subCost.data || '{}');
  }
}
