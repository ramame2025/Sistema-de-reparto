import { Module } from '@nestjs/common';
import { DriverTruckAssignmentsModule } from '../driver-truck-assignments/driver-truck-assignments.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [DriverTruckAssignmentsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
