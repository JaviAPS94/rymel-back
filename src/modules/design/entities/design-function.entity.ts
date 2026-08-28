import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DesignSubTypeFunction } from './design-subtype-function.entity';
import { DesignFunctionVersion } from './design-function-version.entity';
import { TemplateType } from '../../../common/enums';

/**
 * Identidad de una fórmula de diseño.
 *
 * La expresión, las variables y las constantes ya no viven aquí: son de la
 * versión vigente (`DesignFunctionVersion`). Lo que permanece es lo que
 * identifica a la fórmula a lo largo de sus versiones.
 */
@Entity('design_function')
export class DesignFunction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  /**
   * Nombre con el que se invoca desde una celda: `=CUBIC(A1, B2)`.
   *
   * Debe ser único entre las fórmulas activas del mismo tipo, y ningún código
   * puede ser sufijo de otro. La restricción se aplica en el servicio y no en
   * la base: los datos actuales ya tienen `CUBIC` y `QUADRATIC` duplicados, y
   * decidir cuál sobrevive es del propietario del producto, no de una
   * migración.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * Subtipos a los que está asignada esta fórmula.
   *
   * La inversa es `designFunction` y no `designSubType`: apuntar a la otra
   * hacía que TypeORM uniera `design_subtype_id` contra el id de la fórmula,
   * de modo que filtrar por subtipo solo devolvía la fórmula cuyo id
   * coincidiera por casualidad con el del subtipo. No daba error: daba una
   * lista vacía.
   */
  @OneToMany(
    () => DesignSubTypeFunction,
    (designSubTypeFunction) => designSubTypeFunction.designFunction,
  )
  designSubTypeFunctions: DesignSubTypeFunction[];

  @OneToMany(() => DesignFunctionVersion, (version) => version.designFunction)
  versions: DesignFunctionVersion[];

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
