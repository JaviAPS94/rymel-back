import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the `fantasma` / `fantasma_component` tables (and their columns,
 * constraints and indexes) to their English equivalents: `phantom_item` /
 * `phantom_item_component`. The original migration (1786000000000-fantasma)
 * already ran in every environment, so this is a rename-only follow-up
 * rather than an edit to that file.
 */
export class PhantomItemEnglishNaming1786100000000
  implements MigrationInterface
{
  name = 'PhantomItemEnglishNaming1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Columns: fantasma -> phantom_item ---
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.tipo_pt', 'finished_product_type', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.tipo_pp', 'work_in_process_type', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.raiz_fantasma', 'phantom_root_code', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.r_kva_norma', 'kva_rating_standard', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.item', 'item_code', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.referencia', 'reference', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.desc_item', 'item_description', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.desc_corta', 'short_description', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.um', 'unit_of_measure', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.limite_referencia', 'reference_length_limit', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.formulas', 'formula_overrides', 'COLUMN'`,
    );

    // --- Columns: fantasma_component -> phantom_item_component ---
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.fantasma_id', 'phantom_item_id', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.orden', 'sort_order', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.item_componente', 'component_item_code', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.descripcion', 'description', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.cant_base', 'base_quantity', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.cant_requerida', 'required_quantity', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.cant_requerida_unitaria', 'required_quantity_per_unit', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.um_componente', 'component_unit_of_measure', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.porcentaje_desperdicio', 'waste_percentage', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.bodega_consumo', 'consumption_warehouse', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.formulas', 'formula_overrides', 'COLUMN'`,
    );

    // --- Default constraints ---
    await queryRunner.query(
      `EXEC sp_rename 'DF_fantasma_limite_referencia', 'DF_phantom_item_reference_length_limit'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_fantasma_created_at', 'DF_phantom_item_created_at'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_fantasma_updated_at', 'DF_phantom_item_updated_at'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_fantasma_component_orden', 'DF_phantom_item_component_sort_order'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_fantasma_component_created_at', 'DF_phantom_item_component_created_at'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_fantasma_component_updated_at', 'DF_phantom_item_component_updated_at'`,
    );

    // --- Indexes ---
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.UQ_fantasma_item_activo', 'UQ_phantom_item_item_code_active', 'INDEX'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.IDX_fantasma_component_fantasma_id', 'IDX_phantom_item_component_phantom_item_id', 'INDEX'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.IDX_fantasma_raiz_fantasma', 'IDX_phantom_item_phantom_root_code', 'INDEX'`,
    );

    // --- Primary/foreign key constraints ---
    await queryRunner.query(
      `EXEC sp_rename 'FK_fantasma_component_fantasma', 'FK_phantom_item_component_phantom_item'`,
    );
    await queryRunner.query(`EXEC sp_rename 'PK_fantasma', 'PK_phantom_item'`);
    await queryRunner.query(
      `EXEC sp_rename 'PK_fantasma_component', 'PK_phantom_item_component'`,
    );

    // --- Tables (last: everything above still referenced them by old name) ---
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component', 'phantom_item_component'`,
    );
    await queryRunner.query(`EXEC sp_rename 'fantasma', 'phantom_item'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // --- Tables ---
    await queryRunner.query(`EXEC sp_rename 'phantom_item', 'fantasma'`);
    await queryRunner.query(
      `EXEC sp_rename 'phantom_item_component', 'fantasma_component'`,
    );

    // --- Primary/foreign key constraints ---
    await queryRunner.query(`EXEC sp_rename 'PK_phantom_item', 'PK_fantasma'`);
    await queryRunner.query(
      `EXEC sp_rename 'PK_phantom_item_component', 'PK_fantasma_component'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'FK_phantom_item_component_phantom_item', 'FK_fantasma_component_fantasma'`,
    );

    // --- Indexes ---
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.IDX_phantom_item_phantom_root_code', 'IDX_fantasma_raiz_fantasma', 'INDEX'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.IDX_phantom_item_component_phantom_item_id', 'IDX_fantasma_component_fantasma_id', 'INDEX'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.UQ_phantom_item_item_code_active', 'UQ_fantasma_item_activo', 'INDEX'`,
    );

    // --- Default constraints ---
    await queryRunner.query(
      `EXEC sp_rename 'DF_phantom_item_component_updated_at', 'DF_fantasma_component_updated_at'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_phantom_item_component_created_at', 'DF_fantasma_component_created_at'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_phantom_item_component_sort_order', 'DF_fantasma_component_orden'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_phantom_item_updated_at', 'DF_fantasma_updated_at'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_phantom_item_created_at', 'DF_fantasma_created_at'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'DF_phantom_item_reference_length_limit', 'DF_fantasma_limite_referencia'`,
    );

    // --- Columns: phantom_item_component -> fantasma_component ---
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.formula_overrides', 'formulas', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.consumption_warehouse', 'bodega_consumo', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.waste_percentage', 'porcentaje_desperdicio', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.component_unit_of_measure', 'um_componente', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.required_quantity_per_unit', 'cant_requerida_unitaria', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.required_quantity', 'cant_requerida', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.base_quantity', 'cant_base', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.description', 'descripcion', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.component_item_code', 'item_componente', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.sort_order', 'orden', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma_component.phantom_item_id', 'fantasma_id', 'COLUMN'`,
    );

    // --- Columns: phantom_item -> fantasma ---
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.formula_overrides', 'formulas', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.reference_length_limit', 'limite_referencia', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.unit_of_measure', 'um', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.short_description', 'desc_corta', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.item_description', 'desc_item', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.reference', 'referencia', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.item_code', 'item', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.kva_rating_standard', 'r_kva_norma', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.phantom_root_code', 'raiz_fantasma', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.work_in_process_type', 'tipo_pp', 'COLUMN'`,
    );
    await queryRunner.query(
      `EXEC sp_rename 'fantasma.finished_product_type', 'tipo_pt', 'COLUMN'`,
    );
  }
}
