import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DesignCodeSuffixFormat } from '../entities/design-code-suffix-format.entity';
import {
  CreateSuffixFormatDto,
  UpdateSuffixFormatDto,
} from '../dtos/suffix-format.dto';

@Injectable()
export class DesignCodeSuffixFormatService {
  constructor(
    @InjectRepository(DesignCodeSuffixFormat)
    private readonly repo: Repository<DesignCodeSuffixFormat>,
  ) {}

  findAll(): Promise<DesignCodeSuffixFormat[]> {
    return this.repo.find({
      where: { deletedAt: IsNull() },
      order: { id: 'ASC' },
    });
  }

  async findById(id: number): Promise<DesignCodeSuffixFormat> {
    const entry = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!entry) {
      throw new NotFoundException('Suffix format rule not found');
    }
    return entry;
  }

  async getDefault(): Promise<DesignCodeSuffixFormat | null> {
    return this.repo.findOne({
      where: { isDefault: true, deletedAt: IsNull() },
    });
  }

  async create(dto: CreateSuffixFormatDto): Promise<DesignCodeSuffixFormat> {
    if (dto.isDefault) {
      await this.clearCurrentDefault();
    }
    const entry = this.repo.create(dto);
    return this.repo.save(entry);
  }

  async update(
    id: number,
    dto: UpdateSuffixFormatDto,
  ): Promise<DesignCodeSuffixFormat> {
    const entry = await this.findById(id);
    if (dto.isDefault) {
      await this.clearCurrentDefault(id);
    }
    Object.assign(entry, dto);
    return this.repo.save(entry);
  }

  async remove(id: number): Promise<void> {
    const entry = await this.findById(id);
    if (entry.isDefault) {
      throw new BadRequestException(
        'No se puede eliminar el formato de sufijo predeterminado. Asigne otro formato como predeterminado primero.',
      );
    }
    entry.deletedAt = new Date();
    await this.repo.save(entry);
  }

  private async clearCurrentDefault(excludeId?: number): Promise<void> {
    const current = await this.getDefault();
    if (current && current.id !== excludeId) {
      current.isDefault = false;
      await this.repo.save(current);
    }
  }
}
