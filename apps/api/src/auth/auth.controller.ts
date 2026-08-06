import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  type LoginInput,
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
}
