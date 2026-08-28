import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PhantomItem } from './phantom-item.entity';

/**
 * The SQL Server driver returns `decimal` columns as string. The transformer
 * normalizes them to number so DTOs and derived-field calculations don't have
 * to worry about the type.
 */
const decimalTransformer = {
  to: (value: number | null): number | null => value ?? null,
  from: (value: string | number | null): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  },
};

/**
 * Material line of a phantom item. Maps to columns M–T of the Excel
 * template; each row of the file is one component.
 */
@Entity('phantom_item_component')
export class PhantomItemComponent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PhantomItem, (phantomItem) => phantomItem.components)
  @JoinColumn({ name: 'phantom_item_id' })
  phantomItem: PhantomItem;

  @Column({ name: 'phantom_item_id' })
  phantomItemId: number;

  /** Preserves the original row order from the file */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'component_item_code', type: 'nvarchar', length: 50 })
  componentItemCode: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  description: string;

  @Column({
    name: 'base_quantity',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalTransformer,
  })
  baseQuantity: number;

  @Column({
    name: 'required_quantity',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalTransformer,
  })
  requiredQuantity: number;

  @Column({
    name: 'required_quantity_per_unit',
    type: 'decimal',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  requiredQuantityPerUnit: number;

  @Column({
    name: 'component_unit_of_measure',
    type: 'nvarchar',
    length: 20,
    nullable: true,
  })
  componentUnitOfMeasure: string;

  /** Fraction, not percentage: 0% is stored as 0.0000 */
  @Column({
    name: 'waste_percentage',
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  wastePercentage: number;

  @Column({
    name: 'consumption_warehouse',
    type: 'nvarchar',
    length: 20,
    nullable: true,
  })
  consumptionWarehouse: string;

  /** Formulas that override the default rules, as JSON */
  @Column({
    name: 'formula_overrides',
    type: 'nvarchar',
    length: 'max',
    nullable: true,
  })
  formulaOverrides: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
