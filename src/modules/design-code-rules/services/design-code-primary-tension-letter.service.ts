import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DesignCodePrimaryTensionLetter } from '../entities/design-code-primary-tension-letter.entity';
import {
  CreateTensionLetterDto,
  UpdateTensionLetterDto,
} from '../dtos/tension-letter.dto';

@Injectable()
export class DesignCodePrimaryTensionLetterService {
  constructor(
    @InjectRepository(DesignCodePrimaryTensionLetter)
    private readonly repo: Repository<DesignCodePrimaryTensionLetter>,
  ) {}

  findAll(): Promise<DesignCodePrimaryTensionLetter[]> {
    return this.repo.find({
      where: { deletedAt: IsNull() },
      order: { tensionValue: 'ASC' },
    });
  }

  async findById(id: number): Promise<DesignCodePrimaryTensionLetter> {
    const entry = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!entry) {
      throw new NotFoundException('Primary tension letter rule not found');
    }
    return entry;
  }

  create(dto: CreateTensionLetterDto): Promise<DesignCodePrimaryTensionLetter> {
    const entry = this.repo.create(dto);
    return this.repo.save(entry);
  }

  async update(
    id: number,
    dto: UpdateTensionLetterDto,
  ): Promise<DesignCodePrimaryTensionLetter> {
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
