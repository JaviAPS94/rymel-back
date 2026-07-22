import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('design_code_secondary_tension_letter')
export class DesignCodeSecondaryTensionLetter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tension_value', type: 'decimal', precision: 10, scale: 2 })
  tensionValue: number;

  @Column({ type: 'varchar', length: 1 })
  letter: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
