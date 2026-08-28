/**
 * Administración de plantillas de diseño.
 *
 * Una plantilla es el punto de partida de todo cálculo, y hasta ahora no había
 * forma de administrarla: `TemplateService` tenía un único método de lectura,
 * y las plantillas nacían de un seed o de SQL directo. Se nota en los datos —
 * tres de las cuatro que hay no tienen una sola hoja y aun así se ofrecían en
 * la biblioteca del diseñador.
 *
 * Dos ideas gobiernan este servicio:
 *
 * 1. **Las filas `template` y `sheet` son siempre lo publicado.** El borrador
 *    vive en `template_draft` como documento. Así, editar una plantilla
 *    publicada no cambia lo que cargan los diseñadores hasta que se publique,
 *    y la ruta de lectura de la biblioteca no se toca.
 * 2. **El servidor valida con el mismo contrato que el editor.** El navegador
 *    no es la autoridad sobre lo que entra a la base; que no lo fuera es lo
 *    que permitió que entraran plantillas sin hojas.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, IsNull, Repository } from 'typeorm';
import {
  CONTRACT_VERSION,
  emptySheetStyles,
  readTemplate,
  validateTemplate,
  writeTemplate,
  type PersistedSheet,
  type TemplateDiagnostic,
  type TemplateDocument,
} from '@rymel/design-template';
import { Template } from '../entities/template.entity';
import { Sheet } from '../entities/sheet.entity';
import { TemplateDraft } from '../entities/template-draft.entity';
import { TemplateRevision } from '../entities/template-revision.entity';
import { DesignSubTypeFunction } from '../entities/design-subtype-function.entity';
import { DesignFunction } from '../entities/design-function.entity';
import { DesignFunctionVersion } from '../entities/design-function-version.entity';
import { TemplateStatus, TemplateType } from '../../../common/enums';
import { parseVariables } from '../validation/design-function-rules';
import type {
  CreateSheetDto,
  CreateTemplateDto,
  DuplicateTemplateDto,
  ListTemplatesDto,
  PaginatedTemplatesDto,
  PublishResultDto,
  ReorderSheetsDto,
  SaveSheetDto,
  TemplateDetailDto,
  TemplateListItemDto,
  TemplateRevisionDto,
  UpdateTemplateDto,
} from '../dtos/template-admin.dto';

/** El usuario que ejecuta la acción, para dejar rastro de quién publicó. */
export interface ActingUser {
  id?: number;
  email?: string;
}

const parse = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

@Injectable()
export class TemplateAdminService {
  constructor(
    @InjectRepository(Template)
    private readonly templates: Repository<Template>,
    @InjectRepository(Sheet)
    private readonly sheets: Repository<Sheet>,
    @InjectRepository(TemplateDraft)
    private readonly drafts: Repository<TemplateDraft>,
    @InjectRepository(TemplateRevision)
    private readonly revisions: Repository<TemplateRevision>,
    @InjectRepository(DesignSubTypeFunction)
    private readonly subTypeFunctions: Repository<DesignSubTypeFunction>,
    @InjectRepository(DesignFunction)
    private readonly functions: Repository<DesignFunction>,
    @InjectRepository(DesignFunctionVersion)
    private readonly functionVersions: Repository<DesignFunctionVersion>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------- listado

  async list(query: ListTemplatesDto): Promise<PaginatedTemplatesDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const builder = this.templates
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.designSubType', 'subType')
      .leftJoinAndSelect('template.sheets', 'sheet', 'sheet.deleted_at IS NULL')
      .orderBy('template.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (!query.includeDeleted) {
      builder.andWhere('template.deletedAt IS NULL');
    }
    if (query.type) {
      builder.andWhere('template.type = :type', { type: query.type });
    }
    if (query.status) {
      builder.andWhere('template.status = :status', { status: query.status });
    }
    if (query.designSubTypeId) {
      builder.andWhere('subType.id = :subTypeId', {
        subTypeId: query.designSubTypeId,
      });
    }
    if (query.search) {
      const search = `%${query.search}%`;
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('template.name LIKE :search', { search })
            .orWhere('template.code LIKE :search', { search });
        }),
      );
    }

    const [rows, total] = await builder.getManyAndCount();

    const draftIds = new Set(
      (
        await this.drafts.find({
          select: { templateId: true },
        })
      ).map((draft) => draft.templateId),
    );

    const items: TemplateListItemDto[] = rows.map((template) => {
      const sheets = template.sheets ?? [];
      return {
        id: template.id,
        name: template.name,
        code: template.code,
        description: template.description,
        type: template.type,
        status: template.status,
        version: template.version,
        designSubTypeId: template.designSubType?.id,
        designSubTypeName: template.designSubType?.name,
        sheetCount: sheets.length,
        cellCount: sheets.reduce(
          (total, sheet) => total + Object.keys(parse(sheet.cells, {})).length,
          0,
        ),
        hasDraft: draftIds.has(template.id),
        contractVersion: template.contractVersion,
        updatedAt: template.updatedAt,
      };
    });

    return { items, total, page, limit };
  }

  // ---------------------------------------------------------------- detalle

  /**
   * La plantilla tal como debe verla el editor: su borrador si lo hay, y si
   * no, lo publicado.
   */
  async findOne(id: number): Promise<TemplateDetailDto> {
    const template = await this.requireTemplate(id);
    const draft = await this.drafts.findOne({ where: { templateId: id } });

    const document = draft
      ? (JSON.parse(draft.document) as TemplateDocument)
      : await this.publishedDocument(template);

    return {
      id: template.id,
      status: template.status,
      version: template.version,
      hasDraft: draft != null,
      designSubTypeId: template.designSubType?.id,
      document,
      draftUpdatedAt: draft?.updatedAt,
      diagnostics: await this.validate(template, document),
    };
  }

  // -------------------------------------------------------------- metadatos

  async create(dto: CreateTemplateDto): Promise<TemplateDetailDto> {
    await this.requireFreeCode(dto.code);

    const template = await this.templates.save(
      this.templates.create({
        name: dto.name,
        code: dto.code,
        description: dto.description,
        type: dto.type,
        status: TemplateStatus.DRAFT,
        version: 0,
        designSubType: { id: dto.designSubTypeId } as never,
      }),
    );

    // Una plantilla nueva nace como borrador vacío: sus filas de hoja no
    // existen hasta la primera publicación.
    await this.saveDraft(template.id, {
      name: dto.name,
      code: dto.code,
      description: dto.description,
      type: dto.type,
      designSubTypeId: dto.designSubTypeId,
      status: TemplateStatus.DRAFT,
      version: 0,
      sheets: [],
    });

    return this.findOne(template.id);
  }

  async update(id: number, dto: UpdateTemplateDto): Promise<TemplateDetailDto> {
    const template = await this.requireTemplate(id);

    if (dto.code && dto.code !== template.code) {
      await this.requireFreeCode(dto.code, id);
      template.code = dto.code;
    }
    if (dto.name !== undefined) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description;
    if (dto.type !== undefined) template.type = dto.type;
    if (dto.designSubTypeId !== undefined) {
      template.designSubType = { id: dto.designSubTypeId } as never;
    }

    await this.templates.save(template);

    // Los metadatos también viven en el documento: se mantienen alineados.
    const draft = await this.ensureDraft(id);
    const document = JSON.parse(draft.document) as TemplateDocument;
    await this.saveDraft(id, {
      ...document,
      name: template.name,
      code: template.code,
      description: template.description,
      type: template.type,
      designSubTypeId: dto.designSubTypeId ?? document.designSubTypeId,
    });

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const template = await this.requireTemplate(id);
    template.deletedAt = new Date();
    await this.templates.save(template);
    await this.drafts.delete({ templateId: id });
  }

  // ------------------------------------------------------------------ hojas

  async createSheet(
    id: number,
    dto: CreateSheetDto,
  ): Promise<TemplateDetailDto> {
    const draft = await this.ensureDraft(id, dto.expectedUpdatedAt);
    const document = JSON.parse(draft.document) as TemplateDocument;

    if (document.sheets.some((sheet) => sheet.name === dto.name)) {
      throw new BadRequestException(`Ya hay una hoja llamada "${dto.name}"`);
    }

    document.sheets.push({
      name: dto.name,
      position: document.sheets.length,
      cells: {},
      styles: emptySheetStyles(),
    });

    await this.saveDraft(id, document);
    return this.findOne(id);
  }

  /**
   * Guarda una sola hoja.
   *
   * El editor envía la hoja que tocó, no el documento entero: la hoja más
   * grande que hay guardada son 236 KB y reenviarla completa en cada
   * corrección es desperdicio en cada guardado.
   */
  async saveSheet(
    id: number,
    sheetName: string,
    dto: SaveSheetDto,
  ): Promise<TemplateDetailDto> {
    const draft = await this.ensureDraft(id, dto.expectedUpdatedAt);
    const document = JSON.parse(draft.document) as TemplateDocument;

    // El editor añade las hojas a su documento en memoria y las trae al
    // guardar; nunca las crea antes en el servidor. Exigir que ya existieran
    // dejaba sin hojas a toda plantilla nueva: el guardado fallaba y publicar
    // se encontraba un borrador vacío. Si no está, se crea.
    const existing = document.sheets.findIndex(
      (sheet) => sheet.name === sheetName,
    );
    const index =
      existing === -1
        ? document.sheets.push({
            name: dto.name,
            position: document.sheets.length,
            cells: {},
            styles: emptySheetStyles(),
          }) - 1
        : existing;

    if (
      dto.name !== sheetName &&
      document.sheets.some(
        (sheet, position) => position !== index && sheet.name === dto.name,
      )
    ) {
      throw new BadRequestException(`Ya hay una hoja llamada "${dto.name}"`);
    }

    // La hoja entra por la lectura del contrato, no por asignación directa:
    // así se normaliza igual que todo lo demás, venga de donde venga.
    const [normalized] = readTemplate({
      name: document.name,
      code: document.code,
      sheets: [
        {
          name: dto.name,
          order: index,
          cells: dto.cells as PersistedSheet['cells'],
          cellsStyles: (dto.styles ?? null) as PersistedSheet['cellsStyles'],
        },
      ],
    }).sheets;

    document.sheets[index] = {
      ...normalized,
      position: index,
      ...(document.sheets[index].id === undefined
        ? {}
        : { id: document.sheets[index].id }),
    };

    await this.saveDraft(id, document);
    return this.findOne(id);
  }

  async deleteSheet(id: number, sheetName: string): Promise<TemplateDetailDto> {
    const draft = await this.ensureDraft(id);
    const document = JSON.parse(draft.document) as TemplateDocument;

    const remaining = document.sheets.filter(
      (sheet) => sheet.name !== sheetName,
    );
    if (remaining.length === document.sheets.length) {
      throw new NotFoundException(
        `La plantilla no tiene una hoja "${sheetName}"`,
      );
    }

    document.sheets = remaining.map((sheet, position) => ({
      ...sheet,
      position,
    }));

    await this.saveDraft(id, document);
    return this.findOne(id);
  }

  /**
   * Fija la lista de hojas del borrador: cuáles hay y en qué orden.
   *
   * Es una operación de estructura, no de orden. El editor trabaja sobre su
   * documento en memoria —añade, renombra, elimina y reordena sin hablar con
   * el servidor— y al guardar manda la lista resultante. Lo que no esté en
   * ella se va; lo que falte se crea vacío y llega con su contenido en la
   * llamada siguiente.
   *
   * Antes esto exigía que la lista nombrase exactamente las hojas que ya
   * había, que es justo lo que el editor no puede garantizar.
   */
  async setSheets(
    id: number,
    dto: ReorderSheetsDto,
  ): Promise<TemplateDetailDto> {
    const draft = await this.ensureDraft(id, dto.expectedUpdatedAt);
    const document = JSON.parse(draft.document) as TemplateDocument;

    const duplicated = dto.names.find(
      (name, index) => dto.names.indexOf(name) !== index,
    );
    if (duplicated !== undefined) {
      throw new BadRequestException(
        `Hay más de una hoja llamada "${duplicated}"`,
      );
    }

    const byName = new Map(document.sheets.map((sheet) => [sheet.name, sheet]));

    document.sheets = dto.names.map((name, position) => {
      const existing = byName.get(name);
      return existing
        ? { ...existing, position }
        : { name, position, cells: {}, styles: emptySheetStyles() };
    });

    await this.saveDraft(id, document);
    return this.findOne(id);
  }

  // -------------------------------------------------------------- publicación

  /**
   * Publica el borrador.
   *
   * Valida el documento completo —el cliente no es la autoridad—, guarda una
   * instantánea de lo que estaba publicado y vuelca el borrador sobre las
   * filas. Todo dentro de una transacción: publicar es el momento en que la
   * plantilla se vuelve visible para los diseñadores, y ahí sí es todo o nada.
   */
  async publish(
    id: number,
    user: ActingUser,
    reason?: string,
  ): Promise<PublishResultDto> {
    const template = await this.requireTemplate(id);
    const draft = await this.drafts.findOne({ where: { templateId: id } });

    if (!draft) {
      // El editor guarda antes de publicar, así que llegar aquí significa que
      // de verdad no hay nada pendiente. El mensaje lo dice sin ambigüedad,
      // porque antes se leía como «tus cambios no cuentan».
      throw new BadRequestException(
        'No hay cambios que publicar: lo guardado ya es lo que está publicado.',
      );
    }

    const document = JSON.parse(draft.document) as TemplateDocument;
    const diagnostics = await this.validate(template, document);

    if (diagnostics.length > 0) {
      return { published: false, version: template.version, diagnostics };
    }

    if (document.sheets.length === 0) {
      return {
        published: false,
        version: template.version,
        diagnostics: [
          {
            code: 'empty-name',
            message: 'Una plantilla sin hojas no se puede publicar',
          },
        ],
      };
    }

    const nextVersion = template.version + 1;

    await this.dataSource.transaction(async (manager) => {
      if (template.status === TemplateStatus.PUBLISHED) {
        const previous = await this.publishedDocument(template);
        await manager.getRepository(TemplateRevision).save({
          templateId: template.id,
          version: template.version,
          document: JSON.stringify(previous),
          contractVersion: template.contractVersion,
          author: user.email,
          reason: reason ?? 'publicación',
        });
      }

      const persisted = writeTemplate(document);
      const sheetRepository = manager.getRepository(Sheet);
      const existing = await sheetRepository.find({
        where: { template: { id: template.id }, deletedAt: IsNull() },
      });
      const byName = new Map(existing.map((sheet) => [sheet.name, sheet]));

      for (const sheet of persisted.sheets ?? []) {
        const row = byName.get(sheet.name);
        const payload = {
          name: sheet.name,
          order: sheet.order ?? 0,
          cells: JSON.stringify(sheet.cells),
          cellsStyles: JSON.stringify(sheet.cellsStyles ?? {}),
        };

        if (row) {
          // El orden se asigna en dos pasadas para no chocar con el índice
          // único mientras las posiciones se reorganizan.
          await sheetRepository.update(row.id, { ...payload, order: -row.id });
          byName.delete(sheet.name);
        } else {
          await sheetRepository.save(
            sheetRepository.create({
              ...payload,
              order: -Date.now() % 100000,
              template: { id: template.id } as never,
            }),
          );
        }
      }

      // Las hojas que el borrador ya no tiene se dan de baja.
      for (const removed of byName.values()) {
        await sheetRepository.update(removed.id, { deletedAt: new Date() });
      }

      const saved = await sheetRepository.find({
        where: { template: { id: template.id }, deletedAt: IsNull() },
      });
      for (const sheet of persisted.sheets ?? []) {
        const row = saved.find((candidate) => candidate.name === sheet.name);
        if (row)
          await sheetRepository.update(row.id, { order: sheet.order ?? 0 });
      }

      await manager.getRepository(Template).update(template.id, {
        status: TemplateStatus.PUBLISHED,
        version: nextVersion,
        contractVersion: CONTRACT_VERSION,
      });

      await manager
        .getRepository(TemplateDraft)
        .delete({ templateId: template.id });
    });

    return { published: true, version: nextVersion, diagnostics: [] };
  }

  async discardDraft(id: number): Promise<void> {
    await this.requireTemplate(id);
    await this.drafts.delete({ templateId: id });
  }

  // -------------------------------------------------------------- historial

  async listRevisions(id: number): Promise<TemplateRevisionDto[]> {
    await this.requireTemplate(id);
    const rows = await this.revisions.find({
      where: { templateId: id },
      order: { id: 'DESC' },
    });

    return rows.map((revision) => ({
      id: revision.id,
      version: revision.version,
      author: revision.author,
      reason: revision.reason,
      contractVersion: revision.contractVersion,
      createdAt: revision.createdAt,
    }));
  }

  /**
   * Trae una instantánea al borrador.
   *
   * No toca lo publicado: hasta que se publique de nuevo, los diseñadores
   * siguen viendo lo que veían.
   */
  async restoreRevision(
    id: number,
    revisionId: number,
  ): Promise<TemplateDetailDto> {
    await this.requireTemplate(id);
    const revision = await this.revisions.findOne({
      where: { id: revisionId, templateId: id },
    });

    if (!revision) {
      throw new NotFoundException(
        `La plantilla no tiene la revisión ${revisionId}`,
      );
    }

    const stored = JSON.parse(revision.document) as
      | TemplateDocument
      | { literal: true; sheets: PersistedSheet[] };

    // Las instantáneas del saneamiento guardan las cadenas literales; las de
    // publicación, el documento ya en su forma canónica.
    const document =
      'literal' in stored
        ? readTemplate({
            name: '',
            code: '',
            sheets: stored.sheets.map((sheet) => ({
              ...sheet,
              cells: parse(sheet.cells as unknown as string, {}),
              cellsStyles: parse(sheet.cellsStyles as unknown as string, null),
            })),
          })
        : stored;

    const template = await this.requireTemplate(id);
    await this.saveDraft(id, {
      ...document,
      name: template.name,
      code: template.code,
      type: template.type,
      status: template.status,
      version: template.version,
    });

    return this.findOne(id);
  }

  // ------------------------------------------------------------- duplicación

  async duplicate(
    id: number,
    dto: DuplicateTemplateDto,
  ): Promise<TemplateDetailDto> {
    const source = await this.requireTemplate(id);
    await this.requireFreeCode(dto.code);

    const document = await this.findOne(id);
    const subTypeId = dto.designSubTypeId ?? source.designSubType?.id;

    const copy = await this.templates.save(
      this.templates.create({
        name: dto.name ?? `${source.name} (copia)`,
        code: dto.code,
        description: source.description,
        type: source.type,
        status: TemplateStatus.DRAFT,
        version: 0,
        designSubType: { id: subTypeId } as never,
      }),
    );

    // La copia nace como borrador, sin heredar instantáneas: el historial es
    // de la plantilla que lo vivió, no de una copia suya.
    await this.saveDraft(copy.id, {
      ...document.document,
      name: copy.name,
      code: copy.code,
      status: TemplateStatus.DRAFT,
      version: 0,
      designSubTypeId: subTypeId,
      // Las hojas de la copia son suyas: heredar los identificadores de las
      // filas del original haría que publicar la copia sobrescribiera al
      // original.
      sheets: document.document.sheets.map((sheet) => ({
        name: sheet.name,
        position: sheet.position,
        cells: sheet.cells,
        styles: sheet.styles,
      })),
    });

    return this.findOne(copy.id);
  }

  // ----------------------------------------------------------------- apoyo

  private async requireTemplate(id: number): Promise<Template> {
    const template = await this.templates.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['designSubType', 'sheets'],
    });

    if (!template) throw new NotFoundException(`No existe la plantilla ${id}`);
    return template;
  }

  private async requireFreeCode(
    code: string,
    exceptId?: number,
  ): Promise<void> {
    const existing = await this.templates.findOne({
      where: { code, deletedAt: IsNull() },
    });

    if (existing && existing.id !== exceptId) {
      throw new ConflictException(
        `El código "${code}" ya lo usa la plantilla ${existing.id}`,
      );
    }
  }

  /** El documento tal como está publicado, leído de las filas. */
  private async publishedDocument(
    template: Template,
  ): Promise<TemplateDocument> {
    const rows = await this.sheets.find({
      where: { template: { id: template.id }, deletedAt: IsNull() },
      order: { order: 'ASC', id: 'ASC' },
    });

    return readTemplate({
      id: template.id,
      name: template.name,
      code: template.code,
      description: template.description,
      type: template.type,
      designSubTypeId: template.designSubType?.id,
      status: template.status,
      version: template.version,
      sheets: rows.map((row) => ({
        id: row.id,
        name: row.name,
        order: row.order,
        cells: parse(row.cells, {}),
        cellsStyles: parse(row.cellsStyles, null),
      })),
    });
  }

  private async ensureDraft(
    id: number,
    expectedUpdatedAt?: string,
  ): Promise<TemplateDraft> {
    const template = await this.requireTemplate(id);
    const existing = await this.drafts.findOne({ where: { templateId: id } });

    if (existing) {
      this.requireFresh(existing, expectedUpdatedAt);
      return existing;
    }

    // El primer cambio sobre una plantilla publicada abre su borrador a partir
    // de lo publicado. Lo publicado no se toca.
    const document = await this.publishedDocument(template);
    return this.saveDraft(id, document);
  }

  /**
   * Rechaza una escritura basada en un borrador que ya cambió.
   *
   * Sin esto, dos sesiones sobre la misma plantilla se pisan en silencio y la
   * última en guardar gana sin que nadie se entere.
   */
  private requireFresh(draft: TemplateDraft, expectedUpdatedAt?: string): void {
    if (!expectedUpdatedAt) return;

    const expected = new Date(expectedUpdatedAt).getTime();
    const actual = new Date(draft.updatedAt).getTime();

    if (Number.isFinite(expected) && expected !== actual) {
      throw new ConflictException(
        'La plantilla cambió desde que la cargaste. Recarga antes de guardar.',
      );
    }
  }

  private async saveDraft(
    templateId: number,
    document: TemplateDocument,
  ): Promise<TemplateDraft> {
    const existing = await this.drafts.findOne({ where: { templateId } });

    return this.drafts.save({
      ...(existing ?? {}),
      templateId,
      document: JSON.stringify(document),
      contractVersion: CONTRACT_VERSION,
    });
  }

  /**
   * Valida el documento con el contrato compartido, dándole las funciones de
   * diseño asignadas al subtipo y el catálogo completo de códigos.
   *
   * El catálogo sirve para distinguir dos errores que se arreglan distinto:
   * una función que no existe está mal escrita; una que existe pero no está
   * asignada a este subtipo se arregla asignándola.
   */
  private async validate(
    template: Template,
    document: TemplateDocument,
  ): Promise<TemplateDiagnostic[]> {
    const subTypeId = template.designSubType?.id ?? document.designSubTypeId;

    const assignments = subTypeId
      ? await this.subTypeFunctions.find({
          where: { designSubType: { id: subTypeId }, deletedAt: IsNull() },
          relations: ['designFunction'],
        })
      : [];

    const assignedIds = assignments
      .map((assignment) => assignment.designFunction?.id)
      .filter((id): id is number => id != null);

    const versions = await this.functionVersions.find({
      where: { isCurrent: true },
    });
    const variablesByFunction = new Map(
      versions.map((version) => [version.designFunctionId, version.variables]),
    );

    const designFunctions = assignments
      .map((assignment) => assignment.designFunction)
      .filter((designFunction) => designFunction != null)
      .map((designFunction) => ({
        code: designFunction.code,
        variables: parseVariables(
          variablesByFunction.get(designFunction.id) ?? '',
        ),
      }));

    const catalog = await this.functions.find({
      where: { deletedAt: IsNull() },
      select: { id: true, code: true },
    });

    return validateTemplate(document, {
      designFunctions,
      catalogFunctionCodes: catalog
        .filter((designFunction) => !assignedIds.includes(designFunction.id))
        .map((designFunction) => designFunction.code)
        .concat(designFunctions.map((designFunction) => designFunction.code)),
    });
  }

  /** Tipos admitidos, para que el editor no los tenga que codificar. */
  templateTypes(): TemplateType[] {
    return Object.values(TemplateType);
  }
}
