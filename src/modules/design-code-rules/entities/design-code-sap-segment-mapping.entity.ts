import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DesignCodeSapSegmentName } from '../enums/design-code-sap-segment-name.enum';

@Entity('design_code_sap_segment_mapping')
export class DesignCodeSapSegmentMapping {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'segment_name', type: 'varchar', length: 30, unique: true })
  segmentName: DesignCodeSapSegmentName;

  @Column({ name: 'segment_index', type: 'int' })
  segmentIndex: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
