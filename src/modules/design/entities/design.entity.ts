import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubDesign } from './sub-design.entity';
import { DesignElement } from './design-element.entity';
import { DesignSubType } from './design-subtype.entity';
import { Cost } from 'src/modules/costs/entities/cost.entity';

@Entity()
export class Design {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('nvarchar', { length: 'max' })
  name: string;

  @Column('nvarchar', { length: 'max' })
  code: string;

  @OneToMany(() => SubDesign, (subDesign) => subDesign.design)
  subDesigns: SubDesign[];

  @OneToMany(() => DesignElement, (designElement) => designElement.design)
  designElements: DesignElement[];

  @ManyToOne(() => DesignSubType, (designSubType) => designSubType.designs)
  @JoinColumn({ name: 'design_subtype_id' })
  designSubType: DesignSubType;

  @OneToOne(() => Cost, (cost) => cost.design)
  cost: Cost | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
