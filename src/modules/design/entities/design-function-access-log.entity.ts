import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Registro de accesos al texto plano de una fórmula.
 *
 * El descifrado convierte el activo protegido en algo legible. Que sea
 * posible es deliberado —sin ello no se puede editar una fórmula— pero tiene
 * que dejar rastro y ser consultable, no solo aparecer en unos registros de
 * aplicación que rotan y se pierden.
 *
 * Se registra **que** ocurrió el acceso y **quién** lo hizo, nunca **qué** se
 * leyó: aquí no entra la expresión, ni cifrada ni en claro. Una bitácora que
 * la incluyera anularía el cifrado, porque las bitácoras acaban en sitios con
 * menos control que la propia tabla.
 */
@Entity('design_function_access_log')
export class DesignFunctionAccessLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'design_function_id', type: 'int' })
  designFunctionId: number;

  /** Versión cuya expresión se leyó. */
  @Column({ name: 'design_function_version_id', type: 'int', nullable: true })
  designFunctionVersionId?: number;

  /**
   * Identificador del usuario. Es un UUID: `users.id` es `uniqueidentifier`,
   * no un entero.
   */
  @Index()
  @Column({ name: 'user_id', type: 'uniqueidentifier', nullable: true })
  userId?: string;

  @Column({ name: 'user_email', type: 'nvarchar', length: 255, nullable: true })
  userEmail?: string;

  /** `lectura` para una consulta atendida, `fallo` cuando no se pudo recuperar. */
  @Column({ type: 'nvarchar', length: 30 })
  outcome: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
