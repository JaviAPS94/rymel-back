import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { BillOfMaterials } from './entities/bill-of-materials.entity';
import { BillOfMaterialsNode } from './entities/bill-of-materials-node.entity';
import { CreateBillOfMaterialsDto } from './dtos/create-bill-of-materials.dto';
import { UpdateBillOfMaterialsDto } from './dtos/update-bill-of-materials.dto';
import { CreateBomNodeDto } from './dtos/create-bom-node.dto';
import { UpdateBomNodeDto } from './dtos/update-bom-node.dto';
import { BillOfMaterialsNodePhantomFamily } from './entities/bill-of-materials-node-phantom-family.entity';
import { BillOfMaterialsProductType } from './entities/bill-of-materials-product-type.entity';
import { PhantomFamily } from '../phantom-item/entities/phantom-family.entity';

/** Una familia de fantasmas colgada de un nodo, como la devuelve el detalle */
export interface NodePhantomFamilyView {
  id: number;
  family: { id: number; name: string };
  process: { id: number; name: string };
  /** Fantasmas de la familia que ofrece la estructura, según sus Tipos PT */
  offered: number;
}

/** Un fantasma que la estructura ofrece de una familia */
export interface OfferedPhantomItem {
  id: number;
  itemCode: string;
  reference: string;
  finishedProductType: string;
  componentsCount: number;
}

/**
 * El Tipo PT de un fantasma coincide con uno de la estructura sin distinguir
 * mayúsculas ni espacios de los extremos; una estructura sin tipos los
 * acepta todos. `@0` es el id de la estructura.
 */
const OFFERED_BY_BOM = `(
  NOT EXISTS (SELECT 1 FROM bill_of_materials_product_type t WHERE t.bill_of_materials_id = @0)
  OR EXISTS (
    SELECT 1 FROM bill_of_materials_product_type t
    WHERE t.bill_of_materials_id = @0
      AND UPPER(LTRIM(RTRIM(t.code))) = UPPER(LTRIM(RTRIM(i.finished_product_type)))
  )
)`;

@Injectable()
export class BillOfMaterialsService {
  constructor(
    @InjectRepository(BillOfMaterials)
    private readonly bomRepository: Repository<BillOfMaterials>,
    @InjectRepository(BillOfMaterialsNode)
    private readonly nodeRepository: Repository<BillOfMaterialsNode>,
    @InjectRepository(BillOfMaterialsNodePhantomFamily)
    private readonly nodeFamilyRepository: Repository<BillOfMaterialsNodePhantomFamily>,
    @InjectRepository(BillOfMaterialsProductType)
    private readonly productTypeRepository: Repository<BillOfMaterialsProductType>,
    @InjectRepository(PhantomFamily)
    private readonly familyRepository: Repository<PhantomFamily>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateBillOfMaterialsDto): Promise<BillOfMaterials> {
    const bom = this.bomRepository.create(dto);
    return this.bomRepository.save(bom);
  }

  async findAllPaginated(page: number = 1, limit: number = 10) {
    const [data, total] = await this.bomRepository.findAndCount({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const bom = await this.bomRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!bom) throw new NotFoundException(`BOM con id ${id} no encontrado`);

    const nodes = await this.nodeRepository.find({
      where: { billOfMaterialsId: id, deletedAt: IsNull() },
      relations: ['semiFinished'],
      order: { id: 'ASC' },
    });

    return this.withPhantoms(bom, nodes);
  }

  async findByCode(code: string) {
    const bom = await this.bomRepository
      .createQueryBuilder('bom')
      .where(`:code LIKE CONCAT(bom.code, '%')`, { code })
      .andWhere('bom.deleted_at IS NULL')
      .getOne();

    if (!bom)
      throw new NotFoundException(
        `No se encontró un BOM que coincida con el código ${code}`,
      );

    const nodes = await this.nodeRepository.find({
      where: { billOfMaterialsId: bom.id, deletedAt: IsNull() },
      relations: ['semiFinished'],
      order: { id: 'ASC' },
    });

    return this.withPhantoms(bom, nodes);
  }

  async update(id: number, dto: UpdateBillOfMaterialsDto): Promise<void> {
    const bom = await this.bomRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!bom) throw new NotFoundException(`BOM con id ${id} no encontrado`);
    await this.bomRepository.update(id, dto);
  }

  async remove(id: number): Promise<void> {
    const bom = await this.bomRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!bom) throw new NotFoundException(`BOM con id ${id} no encontrado`);
    await this.bomRepository.update(id, { deletedAt: new Date() });
  }

  async addNode(
    bomId: number,
    dto: CreateBomNodeDto,
  ): Promise<BillOfMaterialsNode> {
    const bom = await this.bomRepository.findOne({
      where: { id: bomId, deletedAt: IsNull() },
    });
    if (!bom) throw new NotFoundException(`BOM con id ${bomId} no encontrado`);

    if (dto.parentId) {
      const parent = await this.nodeRepository.findOne({
        where: {
          id: dto.parentId,
          billOfMaterialsId: bomId,
          deletedAt: IsNull(),
        },
      });
      if (!parent)
        throw new BadRequestException(
          `El nodo padre ${dto.parentId} no existe en este BOM`,
        );
    }

    const node = this.nodeRepository.create({
      billOfMaterialsId: bomId,
      semiFinishedId: dto.semiFinishedId,
      parentId: dto.parentId ?? null,
      type: dto.type ?? null,
    });
    return this.nodeRepository.save(node);
  }

  async updateNode(nodeId: number, dto: UpdateBomNodeDto): Promise<void> {
    const node = await this.nodeRepository.findOne({
      where: { id: nodeId, deletedAt: IsNull() },
    });
    if (!node)
      throw new NotFoundException(`Nodo con id ${nodeId} no encontrado`);

    if (dto.parentId !== undefined) {
      if (dto.parentId === nodeId)
        throw new BadRequestException('Un nodo no puede ser su propio padre');

      const parent = await this.nodeRepository.findOne({
        where: {
          id: dto.parentId,
          billOfMaterialsId: node.billOfMaterialsId,
          deletedAt: IsNull(),
        },
      });
      if (!parent)
        throw new BadRequestException(
          `El nodo padre ${dto.parentId} no existe en este BOM`,
        );
    }

    await this.nodeRepository.update(nodeId, {
      ...(dto.semiFinishedId !== undefined && {
        semiFinishedId: dto.semiFinishedId,
      }),
      ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      ...(dto.type !== undefined && { type: dto.type }),
    });
  }

  async removeNode(nodeId: number): Promise<void> {
    const node = await this.nodeRepository.findOne({
      where: { id: nodeId, deletedAt: IsNull() },
    });
    if (!node)
      throw new NotFoundException(`Nodo con id ${nodeId} no encontrado`);

    const allNodes = await this.nodeRepository.find({
      where: { billOfMaterialsId: node.billOfMaterialsId, deletedAt: IsNull() },
    });

    const idsToDelete = this.collectSubtreeIds(nodeId, allNodes);
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(BillOfMaterialsNode, idsToDelete, {
        deletedAt: now,
      });
      // Las familias siguen a su semielaborado
      await manager.update(
        BillOfMaterialsNodePhantomFamily,
        { nodeId: In(idsToDelete), deletedAt: IsNull() },
        { deletedAt: now },
      );
    });
  }

  /** Cuelga familias de un nodo de semielaborado, al final de las que tiene. */
  async addPhantomFamilies(nodeId: number, familyIds: number[]): Promise<void> {
    const node = await this.nodeRepository.findOne({
      where: { id: nodeId, deletedAt: IsNull() },
    });
    if (!node)
      throw new NotFoundException(`Nodo con id ${nodeId} no encontrado`);

    const ids = [...new Set(familyIds)];
    const families = await this.familyRepository.find({
      where: {
        id: In(ids),
        deletedAt: IsNull(),
        process: { deletedAt: IsNull() },
      },
      relations: ['process'],
    });
    const missing = ids.filter((id) => !families.some((f) => f.id === id));
    if (missing.length > 0)
      throw new BadRequestException(
        `Familias de fantasmas no encontradas: ${missing.join(', ')}`,
      );

    const current = await this.nodeFamilyRepository.find({
      where: { nodeId, deletedAt: IsNull() },
    });
    const repeated = families.filter((f) =>
      current.some((c) => c.phantomFamilyId === f.id),
    );
    if (repeated.length > 0)
      throw new ConflictException(
        `El nodo ya tiene la familia ${repeated
          .map((f) => `«${f.name}» (${f.process.name})`)
          .join(', ')}`,
      );

    const last = Math.max(-1, ...current.map((c) => c.position));
    await this.nodeFamilyRepository.save(
      ids.map((phantomFamilyId, index) =>
        this.nodeFamilyRepository.create({
          nodeId,
          phantomFamilyId,
          position: last + 1 + index,
        }),
      ),
    );
  }

  async removePhantomFamily(id: number): Promise<void> {
    const link = await this.nodeFamilyRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!link)
      throw new NotFoundException(
        `Familia del árbol con id ${id} no encontrada`,
      );
    await this.nodeFamilyRepository.update(id, { deletedAt: new Date() });
  }

  /** Reemplaza los Tipos PT de la estructura; sin repetidos ni vacíos. */
  async setProductTypes(bomId: number, codes: string[]): Promise<string[]> {
    const bom = await this.bomRepository.findOne({
      where: { id: bomId, deletedAt: IsNull() },
    });
    if (!bom) throw new NotFoundException(`BOM con id ${bomId} no encontrado`);

    const unique = new Map<string, string>();
    for (const code of codes) {
      const trimmed = code.trim();
      if (trimmed && !unique.has(trimmed.toUpperCase()))
        unique.set(trimmed.toUpperCase(), trimmed);
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(BillOfMaterialsProductType, {
        billOfMaterialsId: bomId,
      });
      if (unique.size > 0)
        await manager.insert(
          BillOfMaterialsProductType,
          [...unique.values()].map((code) => ({
            billOfMaterialsId: bomId,
            code,
          })),
        );
    });
    return [...unique.values()];
  }

  /** Los fantasmas de una familia que ofrece la estructura, por sus Tipos PT. */
  async offeredPhantomItems(
    bomId: number,
    familyId: number,
  ): Promise<OfferedPhantomItem[]> {
    const bom = await this.bomRepository.findOne({
      where: { id: bomId, deletedAt: IsNull() },
    });
    if (!bom) throw new NotFoundException(`BOM con id ${bomId} no encontrado`);

    const rows: Array<OfferedPhantomItem> = await this.dataSource.query(
      `SELECT i.id, i.item_code AS itemCode, i.reference,
              i.finished_product_type AS finishedProductType,
              (SELECT COUNT(*) FROM phantom_item_component c
                WHERE c.phantom_item_id = i.id AND c.deleted_at IS NULL) AS componentsCount
         FROM phantom_item i
        WHERE i.deleted_at IS NULL AND i.family_id = @1 AND ${OFFERED_BY_BOM}
        ORDER BY i.finished_product_type, i.item_code`,
      [bomId, familyId],
    );
    return rows.map((row) => ({
      ...row,
      componentsCount: Number(row.componentsCount),
    }));
  }

  /** El árbol con las familias de cada nodo y los Tipos PT de la estructura. */
  private async withPhantoms(
    bom: BillOfMaterials,
    nodes: BillOfMaterialsNode[],
  ) {
    const productTypes = (
      await this.productTypeRepository.find({
        where: { billOfMaterialsId: bom.id },
        order: { code: 'ASC' },
      })
    ).map((type) => type.code);

    const links =
      nodes.length === 0
        ? []
        : await this.nodeFamilyRepository.find({
            where: { nodeId: In(nodes.map((n) => n.id)), deletedAt: IsNull() },
            relations: ['phantomFamily', 'phantomFamily.process'],
            order: { position: 'ASC', id: 'ASC' },
          });

    const offered = new Map<number, number>();
    const familyIds = [...new Set(links.map((l) => l.phantomFamilyId))];
    if (familyIds.length > 0) {
      const rows: Array<{ familyId: number; n: number }> =
        await this.dataSource.query(
          `SELECT i.family_id AS familyId, COUNT(*) AS n
           FROM phantom_item i
          WHERE i.deleted_at IS NULL
            AND i.family_id IN (${familyIds.map((_, k) => `@${k + 1}`).join(', ')})
            AND ${OFFERED_BY_BOM}
          GROUP BY i.family_id`,
          [bom.id, ...familyIds],
        );
      for (const row of rows) offered.set(Number(row.familyId), Number(row.n));
    }

    const byNode = new Map<number, NodePhantomFamilyView[]>();
    for (const link of links) {
      const family = link.phantomFamily;
      const list = byNode.get(link.nodeId) ?? [];
      list.push({
        id: link.id,
        family: { id: family.id, name: family.name },
        process: { id: family.process.id, name: family.process.name },
        offered: offered.get(family.id) ?? 0,
      });
      byNode.set(link.nodeId, list);
    }

    return {
      ...bom,
      productTypes,
      nodes: this.buildTree(nodes, byNode),
    };
  }

  private buildTree(
    nodes: BillOfMaterialsNode[],
    families: Map<number, NodePhantomFamilyView[]> = new Map(),
  ): any[] {
    const map = new Map<number, any>();

    for (const node of nodes) {
      map.set(node.id, {
        id: node.id,
        semiFinished: node.semiFinished,
        type: node.type,
        parentId: node.parentId,
        children: [],
        phantomFamilies: families.get(node.id) ?? [],
      });
    }

    const roots: any[] = [];
    for (const node of nodes) {
      const dto = map.get(node.id);
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId).children.push(dto);
      } else {
        roots.push(dto);
      }
    }

    return roots;
  }

  private collectSubtreeIds(
    rootId: number,
    allNodes: BillOfMaterialsNode[],
  ): number[] {
    const ids: number[] = [rootId];
    const queue = [rootId];

    while (queue.length) {
      const current = queue.shift();
      const children = allNodes.filter((n) => n.parentId === current);
      for (const child of children) {
        ids.push(child.id);
        queue.push(child.id);
      }
    }

    return ids;
  }
}
