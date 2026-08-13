import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  type AuthSessionResponse,
  type LoginInput,
  type UserRole,
  validateLoginInput,
} from '@distribuidor/shared';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() input: LoginInput) {
    const errors = validateLoginInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid login payload', errors });
    }

    return this.authService.login(input);
  }

  @Get('me')
  me(@Req() request: { user: { username: string; role: UserRole } }): AuthSessionResponse {
    return { username: request.user.username, role: request.user.role };
  }
}
