import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Template } from './template.entity';

/**
 * El documento sobre el que se está trabajando.
 *
 * Las filas `template` y `sheet` son siempre **lo publicado**; el borrador
 * vive aquí. Así, mientras alguien reorganiza una plantilla, los diseñadores
 * siguen cargando la versión que estaba publicada, sin que la ruta de lectura
 * de la biblioteca tenga que enterarse de nada.
 *
 * Una plantilla que nunca se publicó existe solo como borrador: su fila
 * `template` está en `DRAFT` y no tiene hojas hasta la primera publicación.
 */
@Entity()
export class TemplateDraft {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Template)
  @JoinColumn({ name: 'template_id' })
  template: Template;

  @Column({ name: 'template_id' })
  templateId: number;

  /** El `TemplateDocument` completo, serializado. */
  @Column({ type: 'nvarchar', length: 'max' })
  document: string;

  @Column({
    name: 'contract_version',
    type: 'nvarchar',
    length: 20,
    nullable: true,
  })
  contractVersion?: string;

  @Column({ name: 'updated_by', type: 'nvarchar', length: 255, nullable: true })
  updatedBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Marca de la última escritura. Es lo que el editor devuelve al guardar
   * para que el servidor pueda rechazar una escritura basada en una versión
   * que ya quedó atrás.
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
