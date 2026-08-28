import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Template } from './template.entity';

/**
 * Instantánea de lo que estaba publicado antes de una publicación.
 *
 * No es un sistema de linaje como el de las fórmulas, y no hace falta que lo
 * sea: un diseño guardado copia las hojas dentro de sí, así que editar una
 * plantilla no desactualiza ningún diseño y no hay nada que propagar. Lo que
 * sí hace falta es poder volver atrás — quien lleva media hora reorganizando
 * 1900 celdas necesita deshacer más allá de su sesión.
 *
 * También la usa la migración de saneamiento: antes de normalizar guarda aquí
 * el contenido literal previo, que es de donde se restaura si algo sale mal.
 */
@Entity()
export class TemplateRevision {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Template)
  @JoinColumn({ name: 'template_id' })
  template: Template;

  @Column({ name: 'template_id' })
  templateId: number;

  /** Versión que tenía la plantilla cuando se tomó la instantánea. */
  @Column({ type: 'int' })
  version: number;

  /** El documento completo, serializado con el contrato. */
  @Column({ type: 'nvarchar', length: 'max' })
  document: string;

  @Column({
    name: 'contract_version',
    type: 'nvarchar',
    length: 20,
    nullable: true,
  })
  contractVersion?: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  author?: string;

  /** Por qué se tomó: una publicación, o el saneamiento de datos. */
  @Column({ type: 'nvarchar', length: 255, nullable: true })
  reason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
