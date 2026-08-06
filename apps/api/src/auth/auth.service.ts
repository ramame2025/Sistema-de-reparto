import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type AuthLoginResponse,
  type LoginInput,
  type UserRole,
} from '@distribuidor/shared';
import { JwtService } from '@nestjs/jwt';

type AuthUser = {
  id: string;
  username: string;
  password: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  private readonly users: AuthUser[] = [
    {
      id: 'admin-1',
      username: process.env.ADMIN_USERNAME ?? 'admin',
      password: process.env.ADMIN_PASSWORD ?? 'admin123',
      role: 'admin',
    },
    {
      id: 'chofer-1',
      username: process.env.DRIVER_USERNAME ?? 'chofer',
      password: process.env.DRIVER_PASSWORD ?? 'chofer123',
      role: 'chofer',
    },
  ];

  constructor(private readonly jwtService: JwtService) {}

  login(input: LoginInput): AuthLoginResponse {
    const username = input.username.trim();
    const user = this.users.find(
      (candidate) =>
        candidate.username === username && candidate.password === input.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const expiresInSeconds = 60 * 60 * 12;
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
      },
      { expiresIn: expiresInSeconds },
    );

    return {
      accessToken,
      username: user.username,
      role: user.role,
      expiresInSeconds,
    };
  }
}
