import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BillOfMaterials } from './entities/bill-of-materials.entity';
import { BillOfMaterialsNode } from './entities/bill-of-materials-node.entity';
import { CreateBillOfMaterialsDto } from './dtos/create-bill-of-materials.dto';
import { UpdateBillOfMaterialsDto } from './dtos/update-bill-of-materials.dto';
import { CreateBomNodeDto } from './dtos/create-bom-node.dto';
import { UpdateBomNodeDto } from './dtos/update-bom-node.dto';

@Injectable()
export class BillOfMaterialsService {
  constructor(
    @InjectRepository(BillOfMaterials)
    private readonly bomRepository: Repository<BillOfMaterials>,
    @InjectRepository(BillOfMaterialsNode)
    private readonly nodeRepository: Repository<BillOfMaterialsNode>,
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

    return { ...bom, nodes: this.buildTree(nodes) };
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

    return { ...bom, nodes: this.buildTree(nodes) };
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
    await this.nodeRepository.update(idsToDelete, { deletedAt: new Date() });
  }

  private buildTree(nodes: BillOfMaterialsNode[]): any[] {
    const map = new Map<number, any>();

    for (const node of nodes) {
      map.set(node.id, {
        id: node.id,
        semiFinished: node.semiFinished,
        type: node.type,
        parentId: node.parentId,
        children: [],
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
