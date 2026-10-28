import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { Design } from '../entities/design.entity';
import { SubDesign } from '../entities/sub-design.entity';
import { DesignBomAdjustment } from '../entities/design-bom-adjustment.entity';
import {
  AdminDesignFiltersDto,
  AdminDesignPageDto,
  NamedOption,
  SubDesignVersionsDto,
} from '../dtos/admin-designs.dto';
import {
  DesignRecalculationService,
  RecalculationReport,
} from './design-recalculation.service';

/** Algún elemento del diseño `design.id` (alias `de`, `e`, `n`) cumple `condition`. */
const anyElement = (condition: string) =>
  `EXISTS (SELECT 1 FROM design_element de
           JOIN element e ON e.id = de.element_id
           LEFT JOIN norm n ON n.id = e.norm_id
           WHERE de.design_id = design.id AND de.deleted_at IS NULL AND ${condition})`;

/**
 * Los diseños del cliente, para el admin: listado ligero con filtros y
 * recálculo de uno. El detalle es `GET /design/by-id/:id`.
 */
@Injectable()
export class AdminDesignsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly recalculation: DesignRecalculationService,
  ) {}

  async list(filters: AdminDesignFiltersDto): Promise<AdminDesignPageDto> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const query = this.dataSource
      .getRepository(Design)
      .createQueryBuilder('design')
      .leftJoin('design.designSubType', 'subtype')
      .select(['design.id', 'design.createdAt', 'design.updatedAt'])
      .where('design.deletedAt IS NULL');

    const search = filters.search?.trim();
    if (search) {
      query.andWhere('(design.code LIKE :search OR design.name LIKE :search)', {
        search: `%${search}%`,
      });
    }
    if (filters.normId) query.andWhere(anyElement('e.norm_id = :normId'), { normId: filters.normId });
    if (filters.countryId) {
      query.andWhere(anyElement('n.country_id = :countryId'), { countryId: filters.countryId });
    }
    if (filters.sapReference?.trim()) {
      query.andWhere(anyElement('e.sap_refence LIKE :sapReference'), {
        sapReference: `%${filters.sapReference.trim()}%`,
      });
    }
    if (filters.designSubtypeId) {
      query.andWhere('subtype.id = :designSubtypeId', { designSubtypeId: filters.designSubtypeId });
    }
    if (filters.designTypeId) {
      query.andWhere('subtype.design_type_id = :designTypeId', { designTypeId: filters.designTypeId });
    }
    const dateColumn = filters.dateField === 'updated' ? 'design.updatedAt' : 'design.createdAt';
    if (filters.from) query.andWhere(`${dateColumn} >= :from`, { from: filters.from });
    if (filters.to) {
      // `to` incluye el día entero
      const to = new Date(new Date(filters.to).getTime() + 86_400_000);
      query.andWhere(`${dateColumn} < :to`, { to });
    }
    const staleSql = `EXISTS (SELECT 1 FROM sub_design sd WHERE sd.design_id = design.id
                      AND sd.deleted_at IS NULL AND sd.is_stale = 1)`;
    if (filters.stale !== undefined) {
      query.andWhere(filters.stale ? staleSql : `NOT ${staleSql}`);
    }
    const adjustedSql = `EXISTS (SELECT 1 FROM design_bom_adjustment a WHERE a.design_id = design.id
                         AND a.deleted_at IS NULL)`;
    if (filters.adjusted !== undefined) {
      query.andWhere(filters.adjusted ? adjustedSql : `NOT ${adjustedSql}`);
    }

    const [ids, total] = await query
      .orderBy('design.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const result = {
      data: [] as AdminDesignPageDto['data'],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      options: await this.options(),
    };
    if (ids.length === 0) return result;

    const designIds = ids.map((design) => design.id);
    const [designs, staleRows, adjustments] = await Promise.all([
      this.dataSource.getRepository(Design).find({
        where: { id: In(designIds) },
        relations: {
          designSubType: { designType: true },
          designElements: { element: { norm: { country: true } } },
        },
      }),
      this.dataSource.getRepository(SubDesign).find({
        where: { design: { id: In(designIds) }, deletedAt: IsNull(), isStale: true },
        relations: { design: true },
        select: { id: true, design: { id: true } },
      }),
      this.dataSource.getRepository(DesignBomAdjustment).find({
        where: { designId: In(designIds), deletedAt: IsNull() },
      }),
    ]);
    const byId = new Map(designs.map((design) => [design.id, design]));
    const staleIds = new Set(staleRows.map((row) => row.design.id));
    const adjustmentOf = new Map(adjustments.map((adjustment) => [adjustment.designId, adjustment]));
    const named = (value?: { id: number; name: string } | null): NamedOption | undefined =>
      value ? { id: value.id, name: value.name } : undefined;

    result.data = designIds.map((id) => {
      const design = byId.get(id)!;
      const adjustment = adjustmentOf.get(id);
      return {
        id,
        code: design.code,
        name: design.name,
        createdAt: design.createdAt,
        updatedAt: design.updatedAt,
        designType: named(design.designSubType?.designType),
        designSubType: named(design.designSubType),
        elements: (design.designElements ?? [])
          .filter((designElement) => !designElement.deletedAt)
          .map(({ element }) => ({
            id: element.id,
            sapReference: element.sapReference ?? undefined,
            norm: named(element.norm),
            country: named(element.norm?.country),
          })),
        stale: staleIds.has(id),
        bomAdjustment: adjustment
          ? { updatedBy: adjustment.updatedBy, updatedAt: adjustment.updatedAt }
          : null,
      };
    });
    return result;
  }

  /** Normas, países, tipos y subtipos que tienen algún diseño activo. */
  private async options(): Promise<AdminDesignPageDto['options']> {
    const activeElements = `FROM design d
      JOIN design_element de ON de.design_id = d.id AND de.deleted_at IS NULL
      JOIN element e ON e.id = de.element_id
      WHERE d.deleted_at IS NULL`;
    const [norms, countries, designTypes, designSubTypes] = await Promise.all([
      this.dataSource.query(
        `SELECT DISTINCT n.id, n.name FROM norm n WHERE n.id IN (SELECT e.norm_id ${activeElements})
         ORDER BY n.name`,
      ),
      this.dataSource.query(
        `SELECT DISTINCT c.id, c.name FROM country c
         WHERE c.id IN (SELECT n.country_id FROM norm n WHERE n.id IN (SELECT e.norm_id ${activeElements}))
         ORDER BY c.name`,
      ),
      this.dataSource.query(
        `SELECT DISTINCT t.id, t.name FROM design_type t
         JOIN design_subtype s ON s.design_type_id = t.id
         JOIN design d ON d.design_subtype_id = s.id AND d.deleted_at IS NULL
         ORDER BY t.name`,
      ),
      this.dataSource.query(
        `SELECT DISTINCT s.id, s.name, s.design_type_id AS designTypeId FROM design_subtype s
         JOIN design d ON d.design_subtype_id = s.id AND d.deleted_at IS NULL
         ORDER BY s.name`,
      ),
    ]);
    return { norms, countries, designTypes, designSubTypes };
  }

  /**
   * El estado de versiones de cada hoja del diseño: qué fórmulas usó, con qué
   * versión, y cuál es la vigente. `function_versions` guarda ids de versión;
   * aquí se traducen a código, nombre y número.
   */
  async versions(id: number): Promise<SubDesignVersionsDto[]> {
    const exists = await this.dataSource.getRepository(Design).exists({
      where: { id, deletedAt: IsNull() },
    });
    if (!exists) throw new NotFoundException('Design not found');
    const subDesigns = await this.dataSource.getRepository(SubDesign).find({
      where: { design: { id }, deletedAt: IsNull() },
      order: { id: 'ASC' },
    });
    const stamps = subDesigns.map((subDesign) => {
      try {
        return JSON.parse(subDesign.functionVersions || '{}') as Record<string, number>;
      } catch {
        return {};
      }
    });
    const functionIds = [...new Set(stamps.flatMap((stamp) => Object.keys(stamp).map(Number)))];
    const versionIds = [...new Set(stamps.flatMap((stamp) => Object.values(stamp)))];
    const params = (values: number[], from = 0) => values.map((_, index) => `@${from + index}`).join(', ');
    const functions: { id: number; code?: string; name?: string; current?: number }[] = functionIds.length
      ? await this.dataSource.query(
          `SELECT f.id, f.code, f.name,
             (SELECT MAX(v.version) FROM design_function_version v
              WHERE v.design_function_id = f.id AND v.is_current = 1) AS [current]
           FROM design_function f WHERE f.id IN (${params(functionIds)})`,
          functionIds,
        )
      : [];
    const versions: { id: number; version: number }[] = versionIds.length
      ? await this.dataSource.query(
          `SELECT id, version FROM design_function_version WHERE id IN (${params(versionIds)})`,
          versionIds,
        )
      : [];
    const functionOf = new Map(functions.map((row) => [row.id, row]));
    const versionOf = new Map(versions.map((row) => [row.id, row.version]));

    return subDesigns.map((subDesign, index) => ({
      subDesignId: subDesign.id,
      name: subDesign.name,
      stale: subDesign.isStale,
      functions: Object.entries(stamps[index]!).map(([functionId, versionId]) => {
        const fn = functionOf.get(Number(functionId));
        return {
          functionId: Number(functionId),
          code: fn?.code ?? undefined,
          name: fn?.name ?? undefined,
          usedVersion: versionOf.get(versionId),
          currentVersion: fn?.current ?? undefined,
        };
      }),
    }));
  }

  /**
   * Recalcula las hojas desactualizadas de un diseño. Con `dryRun` no
   * escribe: es lo que se mira antes de aplicar, porque el recálculo
   * reescribe números que alguien ya vio.
   */
  async recalculate(id: number, dryRun: boolean, triggeredBy?: string): Promise<RecalculationReport> {
    const exists = await this.dataSource.getRepository(Design).exists({
      where: { id, deletedAt: IsNull() },
    });
    if (!exists) throw new NotFoundException('Design not found');
    const stale = await this.dataSource.getRepository(SubDesign).find({
      where: { design: { id }, deletedAt: IsNull(), isStale: true },
      select: { id: true },
      order: { id: 'ASC' },
    });
    return this.recalculation.recalculate(
      stale.map((subDesign) => subDesign.id),
      triggeredBy,
      dryRun,
    );
  }
}
