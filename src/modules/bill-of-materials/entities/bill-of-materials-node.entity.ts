import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BillOfMaterials } from './bill-of-materials.entity';
import { SemiFinished } from '../../semi-finished/entities/semiFinished.entity';
import { BomNodeType } from '../enums/bom-node-type.enum';

@Entity('bill_of_materials_node')
export class BillOfMaterialsNode {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => BillOfMaterials, (bom) => bom.nodes)
  @JoinColumn({ name: 'bill_of_materials_id' })
  billOfMaterials: BillOfMaterials;

  @Column({ name: 'bill_of_materials_id' })
  billOfMaterialsId: number;

  @ManyToOne(() => BillOfMaterialsNode, (node) => node.children, {
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent: BillOfMaterialsNode;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  @OneToMany(() => BillOfMaterialsNode, (node) => node.parent)
  children: BillOfMaterialsNode[];

  @ManyToOne(() => SemiFinished)
  @JoinColumn({ name: 'semi_finished_id' })
  semiFinished: SemiFinished;

  @Column({ name: 'semi_finished_id' })
  semiFinishedId: number;

  @Column({
    type: 'nvarchar',
    length: 50,
    nullable: true,
    enum: BomNodeType,
  })
  type: BomNodeType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
