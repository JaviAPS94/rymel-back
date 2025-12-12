import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { App } from './enums/app.enum';
import { IsEnum, IsOptional } from 'class-validator';
import { AppOriginInterceptor } from './interceptors/app-origin.interceptor';

class LoginDto {
  email: string;
  password: string;

  @IsOptional()
  @IsEnum(App)
  app?: App;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @UseInterceptors(AppOriginInterceptor)
  login(@Body() body: LoginDto) {
    console.log('Login attempt for:', body);
    return this.authService.login(body.email, body.password, body.app);
  }
}
