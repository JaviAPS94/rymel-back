import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Design } from '../entities/design.entity';
import { DesignBomAdjustment } from '../entities/design-bom-adjustment.entity';
import { bomMatchesReference } from '../../bill-of-materials/bom-reference-match';
import {
  BomReviewStatus,
  DesignBomReviewFiltersDto,
  DesignBomReviewPageDto,
} from '../dtos/design-bom-review.dto';

/** Elementos del diseño `designSql` (alias `de`, `e`). */
const designElements = (designSql: string) =>
  `FROM design_element de JOIN element e ON e.id = de.element_id
   WHERE de.design_id = ${designSql} AND de.deleted_at IS NULL`;

/**
 * El estado de la lista de un diseño, en SQL: el mismo texto filtra el
 * listado y calcula el estado de cada fila, así que no pueden discrepar. La
 * coincidencia con una estructura es la de `GET /bill-of-materials/search`.
 */
const statusSql = (designSql: string) => `CASE
  WHEN EXISTS (SELECT 1 FROM design_bom_adjustment a
               WHERE a.design_id = ${designSql} AND a.deleted_at IS NULL) THEN 'adjusted'
  WHEN EXISTS (SELECT 1 ${designElements(designSql)} AND EXISTS (
                 SELECT 1 FROM bill_of_materials bom
                 WHERE ${bomMatchesReference('bom', 'e.sap_refence')})) THEN 'generable'
  WHEN EXISTS (SELECT 1 ${designElements(designSql)}
               AND e.sap_refence IS NOT NULL AND e.sap_refence <> '') THEN 'no-structure'
  ELSE 'no-reference' END`;

/**
 * Listado de diseños para que el admin revise sus listas de materiales: sin
 * el contenido de las hojas, con el estado de la lista y el ajuste del
 * cliente, si lo hay.
 */
@Injectable()
export class DesignBomReviewService {
  constructor(private readonly dataSource: DataSource) {}

  async list(filters: DesignBomReviewFiltersDto): Promise<DesignBomReviewPageDto> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const query = this.dataSource
      .getRepository(Design)
      .createQueryBuilder('design')
      .select(['design.id', 'design.createdAt'])
      .where('design.deletedAt IS NULL');

    if (filters.normId) {
      query.andWhere(`EXISTS (SELECT 1 ${designElements('design.id')} AND e.norm_id = :normId)`, {
        normId: filters.normId,
      });
    }
    if (filters.sapReference?.trim()) {
      query.andWhere(
        `EXISTS (SELECT 1 ${designElements('design.id')} AND e.sap_refence LIKE :sapReference)`,
        { sapReference: `%${filters.sapReference.trim()}%` },
      );
    }
    if (filters.status) {
      query.andWhere(`(${statusSql('design.id')}) = :status`, { status: filters.status });
    }
    if (filters.from || filters.to) {
      // Un día `to` incluye el día entero
      const to = filters.to ? new Date(new Date(filters.to).getTime() + 86_400_000) : undefined;
      if (filters.dateField === 'adjusted') {
        query.andWhere(
          `EXISTS (SELECT 1 FROM design_bom_adjustment a WHERE a.design_id = design.id
                   AND a.deleted_at IS NULL
                   ${filters.from ? 'AND a.updated_at >= :from' : ''}
                   ${to ? 'AND a.updated_at < :to' : ''})`,
          { from: filters.from, to },
        );
      } else {
        if (filters.from) query.andWhere('design.createdAt >= :from', { from: filters.from });
        if (to) query.andWhere('design.createdAt < :to', { to });
      }
    }

    const [ids, total] = await query
      .orderBy('design.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const norms: { id: number; name: string }[] = await this.dataSource.query(
      `SELECT DISTINCT n.id, n.name FROM norm n
       JOIN element e ON e.norm_id = n.id
       JOIN design_element de ON de.element_id = e.id AND de.deleted_at IS NULL
       JOIN design d ON d.id = de.design_id AND d.deleted_at IS NULL
       ORDER BY n.name`,
    );

    const pageInfo = { total, page, limit, totalPages: Math.ceil(total / limit), norms };
    if (ids.length === 0) return { data: [], ...pageInfo };

    const designIds = ids.map((design) => design.id);
    const designs = await this.dataSource.getRepository(Design).find({
      where: { id: In(designIds) },
      relations: { designElements: { element: { norm: { country: true } } } },
    });
    const statuses: { id: number; status: BomReviewStatus }[] = await this.dataSource.query(
      `SELECT d.id, ${statusSql('d.id')} AS status FROM design d
       WHERE d.id IN (${designIds.map((_, index) => `@${index}`).join(', ')})`,
      designIds,
    );
    const adjustments = await this.dataSource.getRepository(DesignBomAdjustment).find({
      where: { designId: In(designIds) },
    });

    const byId = new Map(designs.map((design) => [design.id, design]));
    const statusOf = new Map(statuses.map((row) => [row.id, row.status]));
    const adjustmentOf = new Map(
      adjustments
        .filter((adjustment) => !adjustment.deletedAt)
        .map((adjustment) => [adjustment.designId, adjustment]),
    );

    const data = designIds.map((id) => {
      const design = byId.get(id)!;
      const elements = (design.designElements ?? [])
        .filter((designElement) => !designElement.deletedAt)
        .map(({ element }) => ({
          id: element.id,
          sapReference: element.sapReference ?? undefined,
          normId: element.norm?.id,
          normName: element.norm?.name,
        }));
      const adjustment = adjustmentOf.get(id);
      return {
        id,
        code: design.code,
        name: design.name,
        createdAt: design.createdAt,
        country: design.designElements?.[0]?.element?.norm?.country?.name,
        elements,
        status: statusOf.get(id) ?? 'no-reference',
        adjustment: adjustment
          ? { updatedBy: adjustment.updatedBy, updatedAt: adjustment.updatedAt }
          : null,
      };
    });

    return { data, ...pageInfo };
  }
}
