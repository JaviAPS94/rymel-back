import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { CreateDesignDto } from '../dtos/create-desing.dto';
import { Design } from '../entities/design.entity';
import { DesignElement } from '../entities/design-element.entity';
import { Element } from 'src/modules/element/entities/element.entity';
import { SubDesign } from '../entities/sub-design.entity';
import { DesignSubType } from '../entities/design-subtype.entity';
import { DesignFiltersPaginatedDto } from '../dtos/designs-filters-paginated.dto';

@Injectable()
export class DesignService {
  constructor(private dataSource: DataSource) {}

  async createDesign(designData: CreateDesignDto): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const designSubType = await queryRunner.manager.findOne(DesignSubType, {
        where: { id: designData.designSubtypeId },
      });

      if (!designSubType) {
        throw new NotFoundException('Design subtype not found');
      }

      const design = new Design();
      design.name = designData.name;
      design.code = designData.code;
      design.designSubType = designSubType;
      const designDb = await queryRunner.manager.save(design);

      //Save design elements with elements that already exists in db
      if (designData.elements && designData.elements.length > 0) {
        const elements = await queryRunner.manager.findBy(Element, {
          id: In(designData.elements),
        });
        if (elements.length !== designData.elements.length) {
          throw new NotFoundException('Some elements not found');
        }
        for (const element of elements) {
          const designElement = new DesignElement();
          designElement.design = designDb;
          designElement.element = element;
          await queryRunner.manager.save(designElement);
        }
      }

      // Save sub-designs if provided
      if (designData.subDesigns && designData.subDesigns.length > 0) {
        for (const subDesignData of designData.subDesigns) {
          const subDesign = new SubDesign();
          subDesign.name = subDesignData.name;
          subDesign.code = subDesignData.code;
          subDesign.design = designDb;
          subDesign.data = JSON.stringify(subDesignData.data);
          await queryRunner.manager.save(subDesign);
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  async findAllPaginated(designFiltersPaginatedDto: DesignFiltersPaginatedDto) {
    const {
      page,
      limit,
      name,
      country,
      designTypeId,
      designSubtypeId,
      designCode,
    } = designFiltersPaginatedDto;

    const queryBuilder = this.dataSource
      .getRepository(Design)
      .createQueryBuilder('design')
      .leftJoinAndSelect('design.designSubType', 'designSubType')
      .leftJoinAndSelect('designSubType.designType', 'designType')
      .leftJoinAndSelect('design.designElements', 'designElements')
      .leftJoinAndSelect('designElements.element', 'element')
      .leftJoinAndSelect('element.norm', 'norm')
      .leftJoinAndSelect('norm.country', 'country')
      .leftJoinAndSelect('design.subDesigns', 'subDesigns')
      .where('country.id = :country', { country });

    if (name && name.trim() !== '') {
      queryBuilder.andWhere('norm.name LIKE :name', { name: `%${name}%` });
    }

    if (designTypeId) {
      queryBuilder.andWhere('designType.id = :designTypeId', { designTypeId });
    }

    if (designSubtypeId) {
      queryBuilder.andWhere('designSubType.id = :designSubtypeId', {
        designSubtypeId,
      });
    }

    if (designCode && designCode.trim() !== '') {
      queryBuilder.andWhere('design.code LIKE :designCode', {
        designCode: `%${designCode}%`,
      });
    }

    queryBuilder.skip((page - 1) * limit).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
