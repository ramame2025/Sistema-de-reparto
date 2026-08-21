import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type CreateLoadManifestInput,
  validateCreateLoadManifestInput,
} from '@distribuidor/shared';
import { LoadManifestsService } from './load-manifests.service';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

type AuthRequest = Request & {
  user?: {
    username?: string;
  };
};

@Controller('load-manifests')
export class LoadManifestsController {
  constructor(private readonly loadManifestsService: LoadManifestsService) {}

  @Roles('admin')
  @Get()
  async listManifests() {
    return this.loadManifestsService.listManifests();
  }

  @Roles('admin', 'chofer')
  @Get('mine')
  async listMyManifests(@Req() req: AuthRequest) {
    const username = req.user?.username?.trim();

    if (!username) {
      throw new UnauthorizedException();
    }

    return this.loadManifestsService.listManifestsByDriver(username);
  }

  @Roles('admin', 'chofer')
  @Post()
  async createManifest(@Body() input: CreateLoadManifestInput, @Req() req: AuthRequest) {
    const errors = validateCreateLoadManifestInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid load manifest payload', errors });
    }

    return this.loadManifestsService.createManifest(input, req.user?.username);
  }
}
