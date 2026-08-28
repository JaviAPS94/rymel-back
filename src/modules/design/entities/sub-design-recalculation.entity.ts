import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Registro de un recálculo sobre un sub-diseño.
 *
 * Un recálculo reescribe números que alguien ya vio y sobre los que quizá
 * tomó una decisión. Sin un registro de qué cambió, un diseño que pasa de
 * `1` a `7` es indistinguible de un error, y no habría forma de revertirlo ni
 * de explicárselo a quien lo estaba usando.
 *
 * Es también lo que alimenta el aviso en project-front: "estos valores se
 * actualizaron por un cambio de fórmulas, y estos son los anteriores".
 */
@Entity('sub_design_recalculation')
export class SubDesignRecalculation {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'sub_design_id', type: 'int' })
  subDesignId: number;

  /**
   * Celdas que cambiaron de valor, en JSON:
   * `[{ "ref": "B11", "formula": "=QUADRATIC(A11)", "before": 1, "after": 7 }]`
   */
  @Column({ name: 'changed_cells', type: 'nvarchar', length: 'max' })
  changedCells: string;

  /** Fórmulas que motivaron el recálculo, con la versión aplicada. */
  @Column({ name: 'applied_versions', type: 'nvarchar', length: 'max' })
  appliedVersions: string;

  @Column({ name: 'changed_count', type: 'int' })
  changedCount: number;

  @Column({
    name: 'triggered_by',
    type: 'nvarchar',
    length: 255,
    nullable: true,
  })
  triggeredBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
