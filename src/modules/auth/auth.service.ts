import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Role } from './enums/role.enum';
import { UsersService } from '../users/user.service';
import { App } from './enums/app.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    console.log('Validating user:', user);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  async login(email: string, password: string, app: App) {
    console.log(`Login request for app: ${app}`);
    const user = await this.validateUser(email, password);

    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles as Role[],
    };

    if (app === App.ADMIN && !user.roles.includes(Role.ADMIN)) {
      throw new UnauthorizedException('User does not have ADMIN role');
    }

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
