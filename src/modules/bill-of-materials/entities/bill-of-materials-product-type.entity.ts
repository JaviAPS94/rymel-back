import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Un Tipo PT (1CA, 3CATC…) que soporta la estructura. Se guarda tal como lo
 * escriben los fantasmas.
 */
@Entity('bill_of_materials_product_type')
export class BillOfMaterialsProductType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'bill_of_materials_id' })
  billOfMaterialsId: number;

  @Column({ type: 'nvarchar', length: 50 })
  code: string;
}
