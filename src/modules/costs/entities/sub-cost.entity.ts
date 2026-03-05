import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cost } from './cost.entity';

@Entity()
export class SubCost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('nvarchar', { length: 'max' })
  name: string;

  @Column('nvarchar', { length: 'max' })
  code: string;

  @Column({ type: 'text', nullable: true })
  data?: string;

  @ManyToOne(() => Cost, (cost) => cost.subCosts)
  @JoinColumn({ name: 'cost_id' })
  cost: Cost;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
