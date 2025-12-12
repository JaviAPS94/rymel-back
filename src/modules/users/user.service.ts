import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../auth/enums/role.enum';
import * as bcrypt from 'bcrypt';
import { UsersResponseDto } from './dtos/users-response.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.usersRepo.findOne({ where: { email, deletedAt: IsNull() } });
  }

  async findAll(
    page: number = 1,
    pageSize: number = 10,
  ): Promise<UsersResponseDto> {
    const skip = (page - 1) * pageSize;

    const [users, total] = await this.usersRepo.findAndCount({
      select: ['id', 'email', 'roles', 'createdAt', 'updatedAt', 'deletedAt'],
      skip,
      take: pageSize,
      order: {
        createdAt: 'DESC',
      },
    });

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        roles: user.roles,
        status: user.deletedAt ? 'inactive' : 'active',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async createUserByAdmin(
    email: string,
    password: string,
    roles?: Role[],
  ): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = this.usersRepo.create({
      email,
      passwordHash,
      roles: roles && roles.length > 0 ? roles : [Role.USER],
    });

    return this.usersRepo.save(user);
  }

  async toggleUserStatus(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });

    if (!user) {
      throw new ConflictException('User not found');
    }

    // Toggle status: if deletedAt is null (active), set it to current date (inactive)
    // if deletedAt has a value (inactive), set it to null (active)
    user.deletedAt = user.deletedAt ? null : new Date();

    return this.usersRepo.save(user);
  }

  async updateUser(
    id: string,
    email: string,
    roles: Role[],
    password?: string,
  ): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });

    if (!user) {
      throw new ConflictException('User not found');
    }

    // Check if email is being changed and if it's already in use by another user
    if (email !== user.email) {
      const existingUser = await this.findByEmail(email);
      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('Email already in use');
      }
    }

    user.email = email;
    user.roles = roles;

    // Only update password if provided
    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    return this.usersRepo.save(user);
  }
}
