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

  async createDesign(designData: CreateDesignDto): Promise<{ id: number }> {
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

      //return desing saved on db
      return {
        id: designDb.id,
      };
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
      .where('country.id = :country', { country })
      .andWhere('design.deletedAt IS NULL');

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

    const [data, total] = await queryBuilder
      .orderBy('design.createdAt', 'DESC')
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Design> {
    const design = await this.dataSource.getRepository(Design).findOne({
      where: { id, deletedAt: null },
      relations: {
        designSubType: {
          designType: true,
        },
        designElements: {
          element: {
            norm: {
              country: true,
            },
            subType: true,
          },
        },
        subDesigns: true,
      },
    });

    if (!design) {
      throw new NotFoundException('Design not found');
    }

    return design;
  }

  async updateDesign(id: number, designData: CreateDesignDto): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const design = await queryRunner.manager.findOne(Design, {
        where: { id, deletedAt: null },
      });

      if (!design) {
        throw new NotFoundException('Design not found');
      }

      const designSubType = await queryRunner.manager.findOne(DesignSubType, {
        where: { id: designData.designSubtypeId },
      });

      if (!designSubType) {
        throw new NotFoundException('Design subtype not found');
      }

      // update in cascade elements and subdesigns
      design.name = designData.name;
      design.code = designData.code;
      design.designSubType = designSubType;

      // First, remove existing design elements and sub-designs
      await queryRunner.manager.delete(DesignElement, { design: { id } });
      await queryRunner.manager.delete(SubDesign, { design: { id } });

      // Then, add the new design elements
      if (designData.elements && designData.elements.length > 0) {
        const elements = await queryRunner.manager.findBy(Element, {
          id: In(designData.elements),
        });
        if (elements.length !== designData.elements.length) {
          throw new NotFoundException('Some elements not found');
        }
        for (const element of elements) {
          const designElement = new DesignElement();
          designElement.design = design;
          designElement.element = element;
          await queryRunner.manager.save(designElement);
        }
      }

      if (designData.subDesigns && designData.subDesigns.length > 0) {
        for (const subDesignData of designData.subDesigns) {
          const subDesign = new SubDesign();
          subDesign.name = subDesignData.name;
          subDesign.code = subDesignData.code;
          subDesign.design = design;
          subDesign.data = JSON.stringify(subDesignData.data);
          await queryRunner.manager.save(subDesign);
        }
      }

      await queryRunner.manager.save(design);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteById(id: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const design = await queryRunner.manager.findOne(Design, {
        where: { id },
      });

      if (!design) {
        throw new NotFoundException('Design not found');
      }

      const deletedAt = new Date();

      await queryRunner.manager.update(
        SubDesign,
        { design: { id } },
        { deletedAt },
      );

      await queryRunner.manager.update(Design, id, { deletedAt });

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
