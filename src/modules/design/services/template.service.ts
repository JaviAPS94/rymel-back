import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Template } from '../entities/template.entity';
import { Repository } from 'typeorm';
import { TemplateType } from '../../../common/enums';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
  ) {}

  async findBySubTypeId(
    designSubTypeId: number,
    type: TemplateType = TemplateType.DESIGN,
  ): Promise<Template[]> {
    return this.templateRepository.find({
      where: {
        designSubType: { id: designSubTypeId },
        type,
        deletedAt: null,
      },
      relations: ['sheets'],
      order: { createdAt: 'DESC' },
    });
  }
}
