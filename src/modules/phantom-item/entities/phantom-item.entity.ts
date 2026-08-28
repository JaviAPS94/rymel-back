import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PhantomItemComponent } from './phantom-item-component.entity';
import { DEFAULT_REFERENCE_LIMIT } from '../constants/phantom-item-columns';

/**
 * Header of a phantom item. Maps to columns A–L of the Excel template, which
 * in the file repeat on every row of the group.
 */
@Entity('phantom_item')
export class PhantomItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'finished_product_type', type: 'nvarchar', length: 50 })
  finishedProductType: string;

  @Column({ name: 'work_in_process_type', type: 'nvarchar', length: 50 })
  workInProcessType: string;

  @Column({ name: 'phantom_root_code', type: 'nvarchar', length: 100 })
  phantomRootCode: string;

  @Column({
    name: 'kva_rating_standard',
    type: 'nvarchar',
    length: 100,
    nullable: true,
  })
  kvaRatingStandard: string;

  /** SAP header code. Unique business identifier. */
  @Column({ name: 'item_code', type: 'nvarchar', length: 50 })
  itemCode: string;

  @Column({ type: 'nvarchar', length: 60 })
  reference: string;

  @Column({ name: 'item_description', type: 'nvarchar', length: 60 })
  itemDescription: string;

  @Column({ name: 'short_description', type: 'nvarchar', length: 40 })
  shortDescription: string;

  @Column({
    name: 'unit_of_measure',
    type: 'nvarchar',
    length: 20,
    nullable: true,
  })
  unitOfMeasure: string;

  /** Limit applied to `referenceLength`. Only admits 40 or 50. */
  @Column({
    name: 'reference_length_limit',
    type: 'int',
    default: DEFAULT_REFERENCE_LIMIT,
  })
  referenceLengthLimit: number;

  /**
   * Formulas that override the default rules of the derived fields, as JSON
   * `{ field: expression }`. Read and written via `formulaOverridesMap`.
   */
  @Column({
    name: 'formula_overrides',
    type: 'nvarchar',
    length: 'max',
    nullable: true,
  })
  formulaOverrides: string;

  @OneToMany(() => PhantomItemComponent, (component) => component.phantomItem)
  components: PhantomItemComponent[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
