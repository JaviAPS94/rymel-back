import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DesignCodeSapSegmentMapping } from '../entities/design-code-sap-segment-mapping.entity';
import {
  CreateSapSegmentMappingDto,
  UpdateSapSegmentMappingDto,
} from '../dtos/sap-segment-mapping.dto';
import { DesignCodeSapSegmentName } from '../enums/design-code-sap-segment-name.enum';

@Injectable()
export class DesignCodeSapSegmentMappingService {
  constructor(
    @InjectRepository(DesignCodeSapSegmentMapping)
    private readonly repo: Repository<DesignCodeSapSegmentMapping>,
  ) {}

  findAll(): Promise<DesignCodeSapSegmentMapping[]> {
    return this.repo.find({
      where: { deletedAt: IsNull() },
      order: { segmentIndex: 'ASC' },
    });
  }

  async findById(id: number): Promise<DesignCodeSapSegmentMapping> {
    const entry = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!entry) {
      throw new NotFoundException('SAP segment mapping rule not found');
    }
    return entry;
  }

  create(dto: CreateSapSegmentMappingDto): Promise<DesignCodeSapSegmentMapping> {
    const entry = this.repo.create(dto);
    return this.repo.save(entry);
  }

  async update(
    id: number,
    dto: UpdateSapSegmentMappingDto,
  ): Promise<DesignCodeSapSegmentMapping> {
    const entry = await this.findById(id);
    Object.assign(entry, dto);
    return this.repo.save(entry);
  }

  async remove(id: number): Promise<void> {
    const entry = await this.findById(id);
    entry.deletedAt = new Date();
    await this.repo.save(entry);
  }

  /** Mapa segmento -> índice (0-based), usado por el motor de generación de código. */
  async getIndexMap(): Promise<Record<DesignCodeSapSegmentName, number | undefined>> {
    const rows = await this.findAll();
    const map = {} as Record<DesignCodeSapSegmentName, number | undefined>;
    for (const row of rows) {
      map[row.segmentName] = row.segmentIndex;
    }
    return map;
  }
}
