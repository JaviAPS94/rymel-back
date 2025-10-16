import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DesignSubType } from './design-subtype.entity';
import { SubType } from 'src/modules/subtype/entities/subtype.entity';

@Entity('design_type')
export class DesignType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('nvarchar', { length: 'max' })
  name: string;

  @OneToMany(() => DesignSubType, (designSubType) => designSubType.designType)
  designSubTypes: DesignSubType[];

  @OneToMany(() => SubType, (subType) => subType.designType)
  subTypes: SubType[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
