import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DesignFunction } from './design-function.entity';
import { DesignFunctionVersion } from './design-function-version.entity';

/**
 * Una versión de fórmula que invoca a otra fórmula.
 *
 * Va de la **versión** que invoca a la **fórmula** invocada, no a una versión
 * concreta: al evaluar se usa siempre la versión vigente de cada una, igual
 * que cuando la invoca una celda. Así, publicar una versión de `QUADRATIC`
 * cambia el resultado de quien la invoca, que es lo que se quiere, y por eso
 * los diseños que la usan a través de otra también quedan desactualizados.
 *
 * El texto de la expresión nunca pasa por aquí: los códigos invocados los
 * devuelve el motor cifrado al validarla.
 */
@Entity('design_function_dependency')
export class DesignFunctionDependency {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => DesignFunctionVersion)
  @JoinColumn({ name: 'version_id' })
  version: DesignFunctionVersion;

  @Column({ name: 'version_id' })
  versionId: number;

  @ManyToOne(() => DesignFunction)
  @JoinColumn({ name: 'depends_on_function_id' })
  dependsOn: DesignFunction;

  @Column({ name: 'depends_on_function_id' })
  dependsOnFunctionId: number;
}
