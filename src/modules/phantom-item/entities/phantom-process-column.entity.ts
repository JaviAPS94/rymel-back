import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PhantomProcess } from './phantom-process.entity';

/** Where a process's own column is stored */
export enum PhantomColumnScope {
  /** One value per phantom item, repeated on every row when exported */
  HEADER = 'HEADER',
  /** One value per component line */
  COMPONENT = 'COMPONENT',
}

/**
 * One column of a process, in order. `key` is either a catalog field
 * (`requiredQuantity`) — typed, validated and with its derived rules — or a
 * process's own text column (`custom:plan1`). `header` is the label this
 * process uses for it, so the same typed field can be «CANT. REQUERIDA LMS»
 * in one process and «CANT. REQUERIDA» in another.
 */
@Entity('phantom_process_column')
export class PhantomProcessColumn {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PhantomProcess, (process) => process.columns)
  @JoinColumn({ name: 'process_id' })
  process: PhantomProcess;

  @Column({ name: 'process_id' })
  processId: number;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'nvarchar', length: 100 })
  key: string;

  @Column({ type: 'nvarchar', length: 100 })
  header: string;

  /** Only meaningful for own columns; catalog columns take it from the catalog */
  @Column({
    type: 'nvarchar',
    length: 20,
    default: PhantomColumnScope.COMPONENT,
  })
  scope: PhantomColumnScope;
}
