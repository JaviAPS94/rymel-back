import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DesignCodePhaseType } from '../enums/design-code-phase-type.enum';

@Entity('design_code_power_letter')
export class DesignCodePowerLetter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'phase_type', type: 'varchar', length: 20 })
  phaseType: DesignCodePhaseType;

  @Column({ name: 'power_kva', type: 'decimal', precision: 10, scale: 2 })
  powerKva: number;

  @Column({ type: 'varchar', length: 1 })
  letter: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
