import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DesignCodeSuffixPattern } from '../enums/design-code-suffix-pattern.enum';

@Entity('design_code_suffix_format')
export class DesignCodeSuffixFormat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 30 })
  pattern: DesignCodeSuffixPattern;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ name: 'is_default', type: 'bit', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
