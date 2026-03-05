import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubCost } from './sub-cost.entity';
import { Design } from 'src/modules/design/entities/design.entity';

@Entity()
export class Cost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('nvarchar', { length: 'max' })
  name: string;

  @Column('nvarchar', { length: 'max' })
  code: string;

  @OneToMany(() => SubCost, (subCost) => subCost.cost)
  subCosts: SubCost[];

  @OneToOne(() => Design, (design) => design.cost)
  @JoinColumn({ name: 'design_id' })
  design: Design;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
