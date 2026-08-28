import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Template } from '../entities/template.entity';
import { Repository } from 'typeorm';
import { TemplateStatus, TemplateType } from '../../../common/enums';

/**
 * Las plantillas que ve el diseñador.
 *
 * Devuelve solo las publicadas. Hasta que existió el estado de publicación no
 * había forma de distinguir una plantilla terminada de una a medio escribir, y
 * se notaba: tres de las cuatro plantillas de la base no tenían una sola hoja
 * y aun así se ofrecían en la biblioteca, donde cargaban en blanco.
 *
 * El filtro es reversible con `TEMPLATE_LIBRARY_PUBLISHED_ONLY=false`. Es el
 * único paso de este cambio que altera lo que ve un diseñador, así que va al
 * final y con marcha atrás: si algo sale mal, se apaga sin desplegar nada.
 */
@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
  ) {}

  /** `false` solo si la variable lo dice explícitamente. */
  private get publishedOnly(): boolean {
    return process.env.TEMPLATE_LIBRARY_PUBLISHED_ONLY !== 'false';
  }

  async findBySubTypeId(
    designSubTypeId: number,
    type: TemplateType = TemplateType.DESIGN,
  ): Promise<Template[]> {
    const templates = await this.templateRepository.find({
      where: {
        designSubType: { id: designSubTypeId },
        type,
        deletedAt: null,
        ...(this.publishedOnly ? { status: TemplateStatus.PUBLISHED } : {}),
      },
      relations: ['sheets'],
      order: { createdAt: 'DESC' },
    });

    if (!this.publishedOnly) {
      this.logger.warn(
        'La biblioteca está sirviendo también los borradores ' +
          '(TEMPLATE_LIBRARY_PUBLISHED_ONLY=false)',
      );
    }

    return templates;
  }
}
