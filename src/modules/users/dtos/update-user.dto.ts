import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../auth/enums/role.enum';

export class UpdateUserDto {
  @IsEmail()
  email: string;

  @IsArray()
  @IsEnum(Role, { each: true })
  roles: Role[];

  @IsOptional()
  @IsString()
  @MinLength(5)
  password?: string;
}
