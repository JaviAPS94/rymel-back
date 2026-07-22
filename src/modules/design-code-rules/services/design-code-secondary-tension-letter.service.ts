import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DesignCodeSecondaryTensionLetter } from '../entities/design-code-secondary-tension-letter.entity';
import {
  CreateTensionLetterDto,
  UpdateTensionLetterDto,
} from '../dtos/tension-letter.dto';

@Injectable()
export class DesignCodeSecondaryTensionLetterService {
  constructor(
    @InjectRepository(DesignCodeSecondaryTensionLetter)
    private readonly repo: Repository<DesignCodeSecondaryTensionLetter>,
  ) {}

  findAll(): Promise<DesignCodeSecondaryTensionLetter[]> {
    return this.repo.find({
      where: { deletedAt: IsNull() },
      order: { tensionValue: 'ASC' },
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

  create(
    dto: CreateTensionLetterDto,
  ): Promise<DesignCodeSecondaryTensionLetter> {
    const entry = this.repo.create(dto);
    return this.repo.save(entry);
  }

  async update(
    id: number,
    dto: UpdateTensionLetterDto,
  ): Promise<DesignCodeSecondaryTensionLetter> {
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
