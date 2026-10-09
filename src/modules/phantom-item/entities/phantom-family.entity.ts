import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PhantomProcess } from './phantom-process.entity';

/**
 * A family of phantom items inside a process: the workbook's «Fantasma»
 * column (F. Emblemas, F. Acc Sol…). Its name is unique within its process.
 */
@Entity('phantom_family')
export class PhantomFamily {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PhantomProcess, (process) => process.families)
  @JoinColumn({ name: 'process_id' })
  process: PhantomProcess;

  @Column({ name: 'process_id' })
  processId: number;

  @Column({ type: 'nvarchar', length: 100 })
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
