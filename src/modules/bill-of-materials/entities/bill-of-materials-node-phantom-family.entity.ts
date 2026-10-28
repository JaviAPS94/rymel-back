import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BillOfMaterialsNode } from './bill-of-materials-node.entity';
import { PhantomFamily } from '../../phantom-item/entities/phantom-family.entity';

/**
 * Una familia de fantasmas colgada de un nodo de semielaborado. Es hoja: no
 * tiene hijos ni tipo de nodo.
 */
@Entity('bill_of_materials_node_phantom_family')
export class BillOfMaterialsNodePhantomFamily {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => BillOfMaterialsNode)
  @JoinColumn({ name: 'node_id' })
  node: BillOfMaterialsNode;

  @Column({ name: 'node_id' })
  nodeId: number;

  @ManyToOne(() => PhantomFamily)
  @JoinColumn({ name: 'phantom_family_id' })
  phantomFamily: PhantomFamily;

  @Column({ name: 'phantom_family_id' })
  phantomFamilyId: number;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
