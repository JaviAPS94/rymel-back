import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DesignSubType } from './design-subtype.entity';
import { Sheet } from './sheet.entity';
import { TemplateType } from '../../../common/enums';

@Entity()
export class Template {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('nvarchar', { length: 'max', nullable: true })
  name: string;

  @Column('nvarchar', { length: 'max' })
  code: string;

  @Column({ type: 'nvarchar', nullable: true })
  description?: string;

  @OneToMany(() => Sheet, (sheet) => sheet.template)
  sheets: Sheet[];

  @ManyToOne(() => DesignSubType, (designSubType) => designSubType.templates)
  @JoinColumn({ name: 'design_sub_type_id' })
  designSubType: DesignSubType;

  @Column({
    type: 'nvarchar',
    length: 50,
    default: TemplateType.DESIGN,
  })
  type: TemplateType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
