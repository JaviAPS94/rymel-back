import { Role } from 'src/modules/auth/enums/role.enum';

export class UserDto {
  id: string;
  email: string;
  roles: Role[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export class UsersResponseDto {
  users: UserDto[];
  total: number;
  page: number;
  pageSize: number;
}
