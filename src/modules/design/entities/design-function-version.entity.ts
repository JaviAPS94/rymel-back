import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DesignFunction } from './design-function.entity';

/**
 * Una versión publicada de una fórmula de diseño.
 *
 * La expresión cifrada, las variables y las constantes viven aquí y no en
 * `design_function`, que conserva solo la identidad. El motivo está en los
 * datos: en la base había sub-diseños con `=QUADRATIC(A11)` guardando `1, 4,
 * 9` y otros, con la misma fórmula, guardando `7, 9, 13`. Alguien cambió
 * QUADRATIC entre una fecha y otra y nada quedó registrado, así que hoy no
 * hay forma de saber cuál de los 25 diseños es confiable.
 *
 * Las versiones publicadas son inmutables: corregir una fórmula es publicar
 * una versión nueva, nunca reescribir una existente. Sin esa regla el
 * historial no serviría para nada, porque no se podría confiar en él.
 */
@Entity('design_function_version')
export class DesignFunctionVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => DesignFunction, (designFunction) => designFunction.versions)
  @JoinColumn({ name: 'design_function_id' })
  designFunction: DesignFunction;

  @Column({ name: 'design_function_id' })
  designFunctionId: number;

  /** Número correlativo dentro de la fórmula, empezando en 1. */
  @Column({ type: 'int' })
  version: number;

  /** Expresión cifrada por el motor cifrado, en formato `iv:texto`. */
  @Column({ type: 'nvarchar', length: 'max' })
  expression: string;

  /**
   * Variables declaradas, separadas por coma.
   *
   * **El orden es contrato**: las hojas de cálculo pasan los argumentos por
   * posición, así que `x,c,d` y `c,x,d` producen resultados distintos para la
   * misma celda, en silencio.
   */
  @Column({ type: 'nvarchar', length: 'max' })
  variables: string;

  /** Mapa de constantes en JSON. */
  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  constants?: string;

  /**
   * Versión vigente de la fórmula. Solo una por fórmula, garantizado por un
   * índice único filtrado en la base.
   */
  @Column({ name: 'is_current', type: 'bit', default: false })
  isCurrent: boolean;

  /** Quién publicó esta versión. Nulo para la versión 1, creada por la migración. */
  @Column({ name: 'created_by', type: 'nvarchar', length: 255, nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
