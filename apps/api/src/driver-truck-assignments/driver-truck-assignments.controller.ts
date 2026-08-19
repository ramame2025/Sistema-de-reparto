import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateAssignmentInput,
  validateCreateAssignmentInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { DriverTruckAssignmentsService } from './driver-truck-assignments.service';

@Controller('driver-truck-assignments')
@Roles('admin')
export class DriverTruckAssignmentsController {
  constructor(
    private readonly assignmentsService: DriverTruckAssignmentsService,
  ) {}

  @Get()
  async listAssignments() {
    return this.assignmentsService.listAssignments();
  }

  @Get('truck/:truckId')
  async findAssignmentForTruckOnDate(
    @Param('truckId') truckId: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new BadRequestException({
        message: 'Invalid query',
        errors: ['date query parameter is required'],
      });
    }

    return this.assignmentsService.findAssignmentForTruckOnDate(truckId, date);
  }

  @Post()
  async createAssignment(@Body() input: CreateAssignmentInput) {
    const errors = validateCreateAssignmentInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid assignment payload', errors });
    }

    return this.assignmentsService.createAssignment(input);
  }

  @Patch(':id/close')
  async closeAssignment(
    @Param('id') id: string,
    @Body('endDate') endDate: string,
  ) {
    if (!endDate) {
      throw new BadRequestException({
        message: 'Invalid payload',
        errors: ['endDate is required'],
      });
    }

    return this.assignmentsService.closeAssignment(id, endDate);
  }
}
