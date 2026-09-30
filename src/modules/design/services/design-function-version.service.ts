/**
 * Publicación y consulta de versiones de fórmula.
 *
 * Aquí se concentra el invariante que sostiene el versionado: las versiones
 * publicadas no se modifican nunca, y hay exactamente una vigente. La base lo
 * garantiza con un índice único filtrado; este servicio se encarga de que la
 * transición entre una vigente y la siguiente sea atómica, porque un instante
 * con cero versiones vigentes dejaría la fórmula sin poder evaluarse.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DesignFunction } from '../entities/design-function.entity';
import { DesignFunctionVersion } from '../entities/design-function-version.entity';
import { DesignFunctionAccessLog } from '../entities/design-function-access-log.entity';
import { SecureFunctionEngineClient } from './secure-function-engine.client';
import { DesignRecalculationService } from './design-recalculation.service';
import {
  DesignFunctionDependencyService,
  type FormulaCall,
} from './design-function-dependency.service';
import { DesignFunctionDependency } from '../entities/design-function-dependency.entity';
import {
  detectIncompatibleVariableChange,
  parseVariables,
  validateConstants,
  validateSymbolsDeclared,
  validateVariables,
  ValidationError,
  type Warning,
} from '../validation/design-function-rules';

export interface ActingUser {
  /** UUID del usuario autenticado. */
  id?: string;
  email?: string;
}

export interface PublishVersionInput {
  designFunctionId: number;
  /** Expresión en texto plano; se valida y se cifra antes de guardar. */
  expression: string;
  variables: string;
  constants: Record<string, number>;
  /** Publicar aunque haya avisos de cambio incompatible. */
  acceptWarnings?: boolean;
}

export interface PublishVersionResult {
  version: DesignFunctionVersion;
  warnings: Warning[];
  /** Sub-diseños que quedaron marcados como desactualizados por esta publicación. */
  staleSubDesigns: number;
}

@Injectable()
export class DesignFunctionVersionService {
  constructor(
    @InjectRepository(DesignFunction)
    private readonly functionRepository: Repository<DesignFunction>,
    @InjectRepository(DesignFunctionVersion)
    private readonly versionRepository: Repository<DesignFunctionVersion>,
    @InjectRepository(DesignFunctionAccessLog)
    private readonly accessLogRepository: Repository<DesignFunctionAccessLog>,
    private readonly engine: SecureFunctionEngineClient,
    private readonly dataSource: DataSource,
    private readonly recalculation: DesignRecalculationService,
    private readonly dependencies: DesignFunctionDependencyService,
  ) {}

  /** Versión vigente de una fórmula. */
  async currentVersion(
    designFunctionId: number,
  ): Promise<DesignFunctionVersion> {
    const version = await this.versionRepository.findOne({
      where: { designFunctionId, isCurrent: true },
    });

    if (!version) {
      throw new NotFoundException(
        `La fórmula ${designFunctionId} no tiene una versión vigente`,
      );
    }

    return version;
  }

  /** Historial completo, de la más reciente a la más antigua. */
  history(designFunctionId: number): Promise<DesignFunctionVersion[]> {
    return this.versionRepository.find({
      where: { designFunctionId },
      order: { version: 'DESC' },
    });
  }

  /**
   * Valida una expresión contra sus variables y constantes declaradas.
   *
   * Devuelve los avisos que no impiden publicar. Lanza `ValidationError` para
   * lo que sí lo impide: un símbolo sin declarar, una constante con valor no
   * numérico, una variable repetida.
   */
  async validateDefinition(
    expression: string,
    variablesRaw: string,
    constants: Record<string, number>,
  ): Promise<{ warnings: Warning[]; formulaCalls: FormulaCall[] }> {
    const variables = parseVariables(variablesRaw);

    validateConstants(constants);
    validateVariables(variables, constants);

    const validation = await this.engine.validate(expression);
    if (!validation.valid) {
      throw new ValidationError(
        validation.error ?? 'El motor rechazó la expresión',
      );
    }

    // Los códigos de otras fórmulas no son símbolos que haya que declarar:
    // el motor los devuelve aparte, como invocaciones.
    return {
      warnings: validateSymbolsDeclared(
        validation.symbols ?? [],
        variables,
        constants,
      ),
      formulaCalls: validation.formulaCalls ?? [],
    };
  }

  /**
   * Publica una versión nueva y la deja vigente.
   *
   * El cambio de vigencia va en una transacción: el índice único filtrado
   * impide que existan dos vigentes, así que hay que retirar la anterior y
   * poner la nueva sin que nada quede a medias.
   */
  async publish(input: PublishVersionInput): Promise<PublishVersionResult> {
    const designFunction = await this.functionRepository.findOne({
      where: { id: input.designFunctionId },
    });

    if (!designFunction) {
      throw new NotFoundException(
        `No existe la fórmula ${input.designFunctionId}`,
      );
    }

    const { warnings, formulaCalls } = await this.validateDefinition(
      input.expression,
      input.variables,
      input.constants,
    );

    // Existencia, tipo, aridad, ciclos y profundidad de las fórmulas que
    // invoca, contra las versiones vigentes de las demás.
    const dependsOn = await this.dependencies.checkComposition({
      functionId: designFunction.id,
      code: designFunction.code,
      type: designFunction.type,
      calls: formulaCalls,
    });

    const current = await this.versionRepository.findOne({
      where: { designFunctionId: input.designFunctionId, isCurrent: true },
    });

    if (current) {
      warnings.push(
        ...detectIncompatibleVariableChange(
          parseVariables(current.variables),
          parseVariables(input.variables),
        ),
      );
    }

    const blocking = warnings.filter(
      (warning) => warning.kind !== 'constante-sin-uso',
    );
    if (blocking.length > 0 && input.acceptWarnings !== true) {
      throw new ValidationError(
        `El cambio afecta a las hojas ya guardadas y requiere confirmación: ` +
          blocking.map((warning) => warning.message).join('; '),
      );
    }

    // El cifrado va fuera de la transacción a propósito: es una llamada de
    // red y no conviene mantener abierta una transacción esperándola.
    const encrypted = await this.engine.encrypt(input.expression);

    const nextNumber = await this.nextVersionNumber(input.designFunctionId);

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.update(
        DesignFunctionVersion,
        { designFunctionId: input.designFunctionId, isCurrent: true },
        { isCurrent: false },
      );

      const version = await manager.save(
        manager.create(DesignFunctionVersion, {
          designFunctionId: input.designFunctionId,
          version: nextNumber,
          expression: encrypted,
          variables: input.variables,
          constants: JSON.stringify(input.constants ?? {}),
          isCurrent: true,
        }),
      );
      await this.saveDependencies(manager, version.id, dependsOn);
      return version;
    });

    // Publicar no cambia ningún valor ya calculado: marca los diseños que
    // quedaron atrás para que alguien decida cuándo recalcularlos.
    const staleSubDesigns = await this.recalculation.markStaleForFunction(
      input.designFunctionId,
      saved.id,
    );

    return { version: saved, warnings, staleSubDesigns };
  }

  private async saveDependencies(
    manager: EntityManager,
    versionId: number,
    dependsOn: readonly number[],
  ): Promise<void> {
    if (dependsOn.length === 0) return;
    await manager.save(
      dependsOn.map((dependsOnFunctionId) =>
        manager.create(DesignFunctionDependency, { versionId, dependsOnFunctionId }),
      ),
    );
  }

  /**
   * Restaura una versión anterior publicándola como una nueva.
   *
   * Nunca reescribe el historial: restaurar la versión 1 de una fórmula que
   * va por la 3 produce una versión 4 con el contenido de la 1. Si se
   * reescribiera, el historial dejaría de ser un registro fiable de lo que
   * estuvo vigente.
   */
  async restore(
    designFunctionId: number,
    versionNumber: number,
  ): Promise<DesignFunctionVersion> {
    const source = await this.versionRepository.findOne({
      where: { designFunctionId, version: versionNumber },
    });

    if (!source) {
      throw new NotFoundException(
        `La fórmula ${designFunctionId} no tiene una versión ${versionNumber}`,
      );
    }

    // La versión restaurada invoca lo mismo que invocaba, pero las demás
    // pueden haber cambiado desde entonces: pasa la misma comprobación que
    // una publicación. El motor analiza la expresión cifrada sin devolverla.
    const designFunction = await this.functionRepository.findOneOrFail({
      where: { id: designFunctionId },
    });
    const dependsOn = await this.dependencies.checkComposition({
      functionId: designFunctionId,
      code: designFunction.code,
      type: designFunction.type,
      calls: await this.engine.invokedFormulas(source.expression),
    });

    const nextNumber = await this.nextVersionNumber(designFunctionId);

    const restored = await this.dataSource.transaction(async (manager) => {
      await manager.update(
        DesignFunctionVersion,
        { designFunctionId, isCurrent: true },
        { isCurrent: false },
      );

      const version = await manager.save(
        manager.create(DesignFunctionVersion, {
          designFunctionId,
          version: nextNumber,
          // Se reutiliza el texto cifrado tal cual: no hace falta descifrar
          // ni volver a cifrar para restaurar, y así el activo no pasa por
          // aquí innecesariamente.
          expression: source.expression,
          variables: source.variables,
          constants: source.constants,
          isCurrent: true,
          createdBy: `restauración de la versión ${versionNumber}`,
        }),
      );
      await this.saveDependencies(manager, version.id, dependsOn);
      return version;
    });

    // Restaurar también cambia la definición vigente, así que los diseños
    // calculados con la anterior quedan igualmente desactualizados.
    await this.recalculation.markStaleForFunction(
      designFunctionId,
      restored.id,
    );

    return restored;
  }

  /**
   * Devuelve la expresión en texto plano de una versión, registrando el
   * acceso.
   *
   * El registro se escribe pase lo que pase, incluso si el descifrado falla:
   * saber que alguien intentó leer una fórmula es tan interesante como saber
   * que la leyó.
   */
  async revealExpression(
    designFunctionId: number,
    user: ActingUser,
  ): Promise<string> {
    const version = await this.currentVersion(designFunctionId);

    try {
      const plainText = await this.engine.decrypt(
        version.expression,
        `user:${user.id ?? 'desconocido'}`,
      );
      await this.recordAccess(designFunctionId, version.id, user, 'lectura');
      return plainText;
    } catch (error) {
      await this.recordAccess(designFunctionId, version.id, user, 'fallo');
      throw error;
    }
  }

  /** Accesos registrados sobre una fórmula, del más reciente al más antiguo. */
  accessLog(designFunctionId: number): Promise<DesignFunctionAccessLog[]> {
    return this.accessLogRepository.find({
      where: { designFunctionId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  private async recordAccess(
    designFunctionId: number,
    versionId: number,
    user: ActingUser,
    outcome: 'lectura' | 'fallo',
  ): Promise<void> {
    await this.accessLogRepository.save(
      this.accessLogRepository.create({
        designFunctionId,
        designFunctionVersionId: versionId,
        userId: user.id,
        userEmail: user.email,
        outcome,
      }),
    );
  }

  private async nextVersionNumber(designFunctionId: number): Promise<number> {
    const latest = await this.versionRepository.findOne({
      where: { designFunctionId },
      order: { version: 'DESC' },
    });
    return (latest?.version ?? 0) + 1;
  }
}
