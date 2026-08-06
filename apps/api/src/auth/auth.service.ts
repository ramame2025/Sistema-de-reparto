import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type AuthLoginResponse,
  type LoginInput,
} from '@distribuidor/shared';
import { JwtService } from '@nestjs/jwt';
import type { UserRole as PrismaUserRole } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultUsers();
  }

  async login(input: LoginInput): Promise<AuthLoginResponse> {
    const username = input.username.trim();
    const user = await this.prisma.userAccount.findUnique({ where: { username } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await compare(input.password, user.passwordHash);
    if (!passwordMatches) {
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

  private async ensureDefaultUsers() {
    await this.upsertUserFromEnv(
      process.env.ADMIN_USERNAME ?? 'admin',
      process.env.ADMIN_PASSWORD ?? 'admin123',
      'admin',
    );

    await this.upsertUserFromEnv(
      process.env.DRIVER_USERNAME ?? 'chofer',
      process.env.DRIVER_PASSWORD ?? 'chofer123',
      'chofer',
    );
  }

  private async upsertUserFromEnv(username: string, password: string, role: PrismaUserRole) {
    const normalizedUsername = username.trim();
    const existing = await this.prisma.userAccount.findUnique({
      where: { username: normalizedUsername },
    });

    if (existing) {
      return;
    }

    const passwordHash = await hash(password, 10);

    await this.prisma.userAccount.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        role,
      },
    });
  }
}
