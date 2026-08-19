import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  type CreateTruckInput,
  validateCreateTruckInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { TrucksService } from './trucks.service';

@Controller('trucks')
@Roles('admin')
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) {}

  @Get()
  async listTrucks() {
    return this.trucksService.listTrucks();
  }

  @Post()
  async createTruck(@Body() input: CreateTruckInput) {
    const errors = validateCreateTruckInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid truck payload', errors });
    }

    return this.trucksService.createTruck(input);
  }

  @Delete(':id')
  @HttpCode(204)
  async deactivateTruck(@Param('id') id: string) {
    await this.trucksService.deactivateTruck(id);
  }
}
