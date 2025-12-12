import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsArray,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { Role } from '../../auth/enums/role.enum';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  // Optional: if not sent, default to USER
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}
