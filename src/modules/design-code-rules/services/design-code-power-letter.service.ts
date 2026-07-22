import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DesignCodePowerLetter } from '../entities/design-code-power-letter.entity';
import {
  CreatePowerLetterDto,
  UpdatePowerLetterDto,
} from '../dtos/power-letter.dto';

@Injectable()
export class DesignCodePowerLetterService {
  constructor(
    @InjectRepository(DesignCodePowerLetter)
    private readonly repo: Repository<DesignCodePowerLetter>,
  ) {}

  findAll(): Promise<DesignCodePowerLetter[]> {
    return this.repo.find({
      where: { deletedAt: IsNull() },
      order: { phaseType: 'ASC', powerKva: 'ASC' },
    });
  }

  async findById(id: number): Promise<DesignCodePowerLetter> {
    const entry = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!entry) {
      throw new NotFoundException('Power letter rule not found');
    }
    return entry;
  }

  create(dto: CreatePowerLetterDto): Promise<DesignCodePowerLetter> {
    const entry = this.repo.create(dto);
    return this.repo.save(entry);
  }

  async update(
    id: number,
    dto: UpdatePowerLetterDto,
  ): Promise<DesignCodePowerLetter> {
    const entry = await this.findById(id);
    Object.assign(entry, dto);
    return this.repo.save(entry);
  }

  async remove(id: number): Promise<void> {
    const entry = await this.findById(id);
    entry.deletedAt = new Date();
    await this.repo.save(entry);
  }
}
