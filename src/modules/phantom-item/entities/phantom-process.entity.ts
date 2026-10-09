import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PhantomFamily } from './phantom-family.entity';
import { PhantomProcessColumn } from './phantom-process-column.entity';

/**
 * A plant process that groups phantom items, one per sheet of the business's
 * workbook (EMBLEMADO, METALMECANICA…). Configurable: administrators create,
 * rename and reorder them, and each one decides its own columns.
 */
@Entity('phantom_process')
export class PhantomProcess {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'nvarchar', length: 100 })
  name: string;

  /** Order of the process tabs and of the exported sheets, from 0 */
  @Column({ type: 'int', default: 0 })
  position: number;

  /**
   * What goes between «Raiz Fantasma» and «R kVA + Norma / Otros» in the
   * reference: nothing (the kVA brings its own hyphen or space, as in
   * EMBLEMADO) or a space (the formula adds it, as in the other sheets).
   */
  @Column({
    name: 'reference_separator',
    type: 'nvarchar',
    length: 5,
    default: '',
  })
  referenceSeparator: string;

  @OneToMany(() => PhantomFamily, (family) => family.process)
  families: PhantomFamily[];

  @OneToMany(() => PhantomProcessColumn, (column) => column.process)
  columns: PhantomProcessColumn[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
