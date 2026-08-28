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
import { TemplateStatus, TemplateType } from '../../../common/enums';

@Entity()
export class Template {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('nvarchar', { length: 'max', nullable: true })
  name: string;

  @Column('nvarchar', { length: 100 })
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

  /**
   * Si los diseñadores la ven. Una plantilla nace en borrador y solo la
   * publicación la hace visible en la biblioteca.
   */
  @Column({
    type: 'nvarchar',
    length: 20,
    default: TemplateStatus.DRAFT,
  })
  status: TemplateStatus;

  /** Cuántas veces se ha publicado. 0 mientras no se haya publicado nunca. */
  @Column({ type: 'int', default: 0 })
  version: number;

  /** Versión de `@rymel/design-template` con la que se validó al publicar. */
  @Column({
    name: 'contract_version',
    type: 'nvarchar',
    length: 20,
    nullable: true,
  })
  contractVersion?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
