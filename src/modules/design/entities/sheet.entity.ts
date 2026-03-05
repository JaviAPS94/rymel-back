import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Template } from './template.entity';

@Entity()
export class Sheet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('nvarchar', { length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  cellsStyles?: string;

  @Column({ type: 'text' })
  cells: string;

  @ManyToOne(() => Template, (template) => template.sheets)
  @JoinColumn({ name: 'template_id' })
  template: Template;

  @Column({ name: 'order', type: 'int', default: 0 })
  order: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
