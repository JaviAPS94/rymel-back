import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { UsersService } from './user.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersPaginatedDto } from './dtos/users-paginated.dto';
import { UpdateUserDto } from './dtos/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  async createUser(@Body() dto: CreateUserDto) {
    const user = await this.usersService.createUserByAdmin(
      dto.email,
      dto.password,
      dto.roles,
    );

    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
    };
  }

  @Get()
  @Roles(Role.ADMIN)
  async findAll(@Query() query: UsersPaginatedDto) {
    return this.usersService.findAll(query.page, query.pageSize);
  }

  @Patch(':id/toggle-status')
  @Roles(Role.ADMIN)
  async toggleUserStatus(@Param('id') id: string) {
    return this.usersService.toggleUserStatus(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const user = await this.usersService.updateUser(
      id,
      dto.email,
      dto.roles,
      dto.password,
    );

    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
    };
  }
}
