import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Design } from './design.entity';

@Entity()
export class SubDesign {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('nvarchar', { length: 'max' })
  name: string;

  @Column('nvarchar', { length: 'max' })
  code: string;

  @Column({ type: 'text', nullable: true })
  data?: string;

  @ManyToOne(() => Design, (design) => design.subDesigns)
  @JoinColumn({ name: 'design_id' })
  design: Design;

  /**
   * Versiones de fórmula con las que se calcularon estas celdas, en JSON:
   * `{ "<designFunctionId>": <versionId> }`.
   *
   * Es lo que permite saber si un número quedó viejo. Va en su propia
   * columna y no dentro de `data` porque ese JSON lo intercambian tres
   * consumidores.
   */
  @Column({
    name: 'function_versions',
    type: 'nvarchar',
    length: 'max',
    nullable: true,
  })
  functionVersions?: string;

  /**
   * El sub-diseño se calculó con una versión que ya no es la vigente.
   *
   * Marcarlo no cambia sus valores: un diseño desactualizado conserva sus
   * números hasta que se recalcule explícitamente.
   */
  @Column({ name: 'is_stale', type: 'bit', default: false })
  isStale: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
