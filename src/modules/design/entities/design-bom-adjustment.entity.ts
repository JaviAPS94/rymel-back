import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Design } from './design.entity';

/**
 * La lista de materiales de un diseño, tal como la dejó el diseñador.
 *
 * La lista se genera en el navegador a partir de la estructura BOM y de las
 * hojas del diseño; esto guarda solo cuando alguien la ajusta. Va en su propia
 * tabla porque `updateDesign` borra y vuelve a crear los `sub_design` en cada
 * guardado, y la fila de `design` es lo único estable del diseño.
 */
@Entity('design_bom_adjustment')
export class DesignBomAdjustment {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Design)
  @JoinColumn({ name: 'design_id' })
  design: Design;

  @Column({ name: 'design_id' })
  designId: number;

  /** Estructura BOM con la que se generó la lista que se ajustó. */
  @Column({ name: 'bom_id' })
  bomId: number;

  /**
   * Huella de la lista generada, sin editar, sobre la que se hizo el ajuste.
   * Si al abrir la lista generada da otra huella, algo de lo que la alimenta
   * cambió desde entonces.
   */
  @Column({ name: 'base_fingerprint', type: 'nvarchar', length: 64 })
  baseFingerprint: string;

  /** Las celdas de la hoja ajustada, serializadas. */
  @Column({ type: 'nvarchar', length: 'max' })
  sheet: string;

  /** Semielaborados hijos desplegados, serializados como arreglo de ids. */
  @Column({ name: 'expanded_nodes', type: 'nvarchar', length: 'max' })
  expandedNodes: string;

  @Column({ name: 'updated_by', type: 'nvarchar', length: 255, nullable: true })
  updatedBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
