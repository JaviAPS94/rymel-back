/**
 * Los campos que definen un elemento.
 *
 * `field.base` guarda un JSON con la definición de cada campo —`phases`,
 * `power`, `primaryVoltage`…— con su etiqueta, su tipo y sus validaciones. Sus
 * claves son exactamente los `elementKey` que una celda de plantilla puede
 * declarar para rellenarse con el dato del elemento al cargarse.
 *
 * Hasta ahora este servicio estaba vacío y el controlador no exponía ninguna
 * ruta, así que ese catálogo no se podía consultar: quien escribiera una
 * plantilla tenía que saberse las claves de memoria.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Field } from './entities/field.entity';
import { SubType } from '../subtype/entities/subtype.entity';
import { DesignSubType } from '../design/entities/design-subtype.entity';

/** Un campo del elemento, tal como lo necesita quien escribe una plantilla. */
export interface ElementField {
  key: string;
  label: string;
  type: string;
  description?: string;
}

interface FieldDefinition {
  label?: string;
  type?: string;
  descriptionInfo?: string;
}

@Injectable()
export class FieldService {
  constructor(
    @InjectRepository(Field)
    private readonly fields: Repository<Field>,
    @InjectRepository(SubType)
    private readonly subTypes: Repository<SubType>,
    @InjectRepository(DesignSubType)
    private readonly designSubTypes: Repository<DesignSubType>,
  ) {}

  /** Todos los campos definidos, sin duplicar claves. */
  async findAll(): Promise<ElementField[]> {
    const rows = await this.fields.find({ where: { deletedAt: IsNull() } });
    return this.merge(rows);
  }

  /**
   * Los campos que alcanzan a un subtipo de diseño.
   *
   * El camino es indirecto porque el modelo lo es: un subtipo de diseño
   * pertenece a un tipo de diseño, y son los subtipos de elemento de ese tipo
   * los que apuntan a un conjunto de campos. Si el subtipo de diseño no lleva
   * a ninguno, se devuelven todos: es preferible ofrecer de más que dejar al
   * autor escribiendo claves a ciegas.
   */
  async findByDesignSubType(designSubTypeId: number): Promise<ElementField[]> {
    const designSubType = await this.designSubTypes.findOne({
      where: { id: designSubTypeId },
      relations: ['designType'],
    });

    if (!designSubType?.designType) return this.findAll();

    const subTypes = await this.subTypes.find({
      where: { designType: { id: designSubType.designType.id } },
      relations: ['field'],
    });

    const rows = subTypes
      .map((subType) => subType.field)
      .filter((field): field is Field => field != null);

    return rows.length > 0 ? this.merge(rows) : this.findAll();
  }

  private merge(rows: Field[]): ElementField[] {
    const byKey = new Map<string, ElementField>();

    for (const row of rows) {
      let definitions: Record<string, FieldDefinition>;
      try {
        definitions = JSON.parse(row.base) as Record<string, FieldDefinition>;
      } catch {
        continue;
      }

      for (const [key, definition] of Object.entries(definitions ?? {})) {
        if (byKey.has(key)) continue;
        byKey.set(key, {
          key,
          label: definition?.label ?? key,
          type: definition?.type ?? 'string',
          ...(definition?.descriptionInfo === undefined
            ? {}
            : { description: definition.descriptionInfo }),
        });
      }
    }

    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
}
