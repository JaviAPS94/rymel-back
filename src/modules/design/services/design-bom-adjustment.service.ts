import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Design } from '../entities/design.entity';
import { DesignBomAdjustment } from '../entities/design-bom-adjustment.entity';
import { SaveDesignBomAdjustmentDto } from '../dtos/design-bom-adjustment.dto';

/**
 * Los ajustes que un diseñador guarda sobre la lista de materiales de su
 * diseño. Una versión por diseño: guardar otra vez la reemplaza.
 */
@Injectable()
export class DesignBomAdjustmentService {
  constructor(private readonly dataSource: DataSource) {}

  private async assertDesign(designId: number): Promise<void> {
    const exists = await this.dataSource.getRepository(Design).exists({
      where: { id: designId, deletedAt: IsNull() },
    });
    if (!exists) {
      throw new NotFoundException('Design not found');
    }
  }

  async find(designId: number): Promise<DesignBomAdjustment> {
    await this.assertDesign(designId);
    const adjustment = await this.dataSource
      .getRepository(DesignBomAdjustment)
      .findOne({ where: { designId, deletedAt: IsNull() } });
    if (!adjustment) {
      throw new NotFoundException('Design has no BOM adjustment');
    }
    return adjustment;
  }

  async save(
    designId: number,
    dto: SaveDesignBomAdjustmentDto,
    updatedBy?: string,
  ): Promise<DesignBomAdjustment> {
    await this.assertDesign(designId);
    const repository = this.dataSource.getRepository(DesignBomAdjustment);
    // Incluye la fila borrada, si la hay: `design_id` es único
    const adjustment =
      (await repository.findOne({ where: { designId } })) ??
      repository.create({ designId });
    adjustment.bomId = dto.bomId;
    adjustment.baseFingerprint = dto.baseFingerprint;
    adjustment.sheet = JSON.stringify(dto.cells);
    adjustment.expandedNodes = JSON.stringify(dto.expandedNodes);
    adjustment.updatedBy = updatedBy;
    adjustment.deletedAt = null;
    return repository.save(adjustment);
  }

  async remove(designId: number): Promise<void> {
    await this.assertDesign(designId);
    const result = await this.dataSource
      .getRepository(DesignBomAdjustment)
      .update({ designId, deletedAt: IsNull() }, { deletedAt: new Date() });
    if (!result.affected) {
      throw new NotFoundException('Design has no BOM adjustment');
    }
  }
}
