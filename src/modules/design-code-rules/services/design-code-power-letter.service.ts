import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { DesignCodePowerLetter } from '../entities/design-code-power-letter.entity';
import {
  CreatePowerLetterDto,
  UpdatePowerLetterDto,
} from '../dtos/power-letter.dto';
import { DesignCodePhaseType } from '../enums/design-code-phase-type.enum';
import { rangesOverlap } from './design-code-range.util';

@Injectable()
export class DesignCodePowerLetterService {
  constructor(
    @InjectRepository(DesignCodePowerLetter)
    private readonly repo: Repository<DesignCodePowerLetter>,
  ) {}

  findAll(): Promise<DesignCodePowerLetter[]> {
    return this.repo.find({
      where: { deletedAt: IsNull() },
      order: { phaseType: 'ASC', powerKvaMin: 'ASC' },
    });
  }

  async findById(id: number): Promise<DesignCodePowerLetter> {
    const entry = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!entry) {
      throw new NotFoundException('Power letter rule not found');
    }
    return entry;
  }

  async create(dto: CreatePowerLetterDto): Promise<DesignCodePowerLetter> {
    await this.validateRange(
      dto.phaseType,
      dto.powerKvaMin,
      dto.powerKvaMax,
    );
    const entry = this.repo.create(dto);
    return this.repo.save(entry);
  }

  async update(
    id: number,
    dto: UpdatePowerLetterDto,
  ): Promise<DesignCodePowerLetter> {
    const entry = await this.findById(id);
    const phaseType = dto.phaseType ?? entry.phaseType;
    const min = dto.powerKvaMin ?? entry.powerKvaMin;
    const max = dto.powerKvaMax ?? entry.powerKvaMax;
    await this.validateRange(phaseType, min, max, id);
    Object.assign(entry, dto);
    return this.repo.save(entry);
  }

  async remove(id: number): Promise<void> {
    const entry = await this.findById(id);
    entry.deletedAt = new Date();
    await this.repo.save(entry);
  }

  private async validateRange(
    phaseType: DesignCodePhaseType,
    min: number,
    max: number,
    excludeId?: number,
  ): Promise<void> {
    if (Number(min) > Number(max)) {
      throw new BadRequestException(
        'powerKvaMin no puede ser mayor que powerKvaMax',
      );
    }
    const others = await this.repo.find({
      where: {
        deletedAt: IsNull(),
        phaseType,
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    const overlaps = others.some((row) =>
      rangesOverlap(
        Number(min),
        Number(max),
        Number(row.powerKvaMin),
        Number(row.powerKvaMax),
      ),
    );
    if (overlaps) {
      throw new BadRequestException(
        `El rango de potencia se solapa con una regla existente para la fase ${phaseType}`,
      );
    }
  }
}
