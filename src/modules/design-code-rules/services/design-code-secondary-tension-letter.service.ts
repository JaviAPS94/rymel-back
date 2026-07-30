import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { DesignCodeSecondaryTensionLetter } from '../entities/design-code-secondary-tension-letter.entity';
import {
  CreateTensionLetterDto,
  UpdateTensionLetterDto,
} from '../dtos/tension-letter.dto';
import { rangesOverlap } from './design-code-range.util';

@Injectable()
export class DesignCodeSecondaryTensionLetterService {
  constructor(
    @InjectRepository(DesignCodeSecondaryTensionLetter)
    private readonly repo: Repository<DesignCodeSecondaryTensionLetter>,
  ) {}

  findAll(): Promise<DesignCodeSecondaryTensionLetter[]> {
    return this.repo.find({
      where: { deletedAt: IsNull() },
      order: { tensionValueMin: 'ASC' },
    });
  }

  async findById(id: number): Promise<DesignCodeSecondaryTensionLetter> {
    const entry = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!entry) {
      throw new NotFoundException('Secondary tension letter rule not found');
    }
    return entry;
  }

  async create(
    dto: CreateTensionLetterDto,
  ): Promise<DesignCodeSecondaryTensionLetter> {
    await this.validateRange(dto.tensionValueMin, dto.tensionValueMax);
    const entry = this.repo.create(dto);
    return this.repo.save(entry);
  }

  async update(
    id: number,
    dto: UpdateTensionLetterDto,
  ): Promise<DesignCodeSecondaryTensionLetter> {
    const entry = await this.findById(id);
    const min = dto.tensionValueMin ?? entry.tensionValueMin;
    const max = dto.tensionValueMax ?? entry.tensionValueMax;
    await this.validateRange(min, max, id);
    Object.assign(entry, dto);
    return this.repo.save(entry);
  }

  async remove(id: number): Promise<void> {
    const entry = await this.findById(id);
    entry.deletedAt = new Date();
    await this.repo.save(entry);
  }

  private async validateRange(
    min: number,
    max: number,
    excludeId?: number,
  ): Promise<void> {
    if (Number(min) > Number(max)) {
      throw new BadRequestException(
        'tensionValueMin no puede ser mayor que tensionValueMax',
      );
    }
    const others = await this.repo.find({
      where: {
        deletedAt: IsNull(),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    const overlaps = others.some((row) =>
      rangesOverlap(
        Number(min),
        Number(max),
        Number(row.tensionValueMin),
        Number(row.tensionValueMax),
      ),
    );
    if (overlaps) {
      throw new BadRequestException(
        'El rango de tensión secundaria se solapa con una regla existente',
      );
    }
  }
}
