import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateUserInput,
  type UserSummary,
} from '@distribuidor/shared';
import type { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(): Promise<UserSummary[]> {
    const users = await this.prisma.userAccount.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }));
  }

  async createUser(input: CreateUserInput): Promise<UserSummary> {
    const username = input.username.trim();
    const existing = await this.prisma.userAccount.findUnique({ where: { username } });

    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await hash(input.password, 10);
    const user = await this.prisma.userAccount.create({
      data: {
        username,
        passwordHash,
        role: input.role as UserRole,
      },
    });

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async changePassword(id: string, password: string): Promise<void> {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await hash(password, 10);
    await this.prisma.userAccount.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async deleteUser(id: string, actorUsername?: string): Promise<void> {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (actorUsername && user.username === actorUsername) {
      throw new ConflictException('Cannot delete current session user');
    }

    if (user.role === 'admin') {
      const adminCount = await this.prisma.userAccount.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new ConflictException('Cannot delete the last admin user');
      }
    }

    await this.prisma.userAccount.delete({ where: { id } });
  }
}
