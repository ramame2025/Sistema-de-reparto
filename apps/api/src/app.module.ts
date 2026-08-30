import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { CustomersModule } from './customers/customers.module';
import { DriverCustomerAssignmentsModule } from './driver-customer-assignments/driver-customer-assignments.module';
import { DriverTruckAssignmentsModule } from './driver-truck-assignments/driver-truck-assignments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { LoadManifestsModule } from './load-manifests/load-manifests.module';
import { ProductsModule } from './products/products.module';
import { PricesModule } from './prices/prices.module';
import { PrismaModule } from './prisma/prisma.module';
import { SalesModule } from './sales/sales.module';
import { TrucksModule } from './trucks/trucks.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Loads the monorepo-root .env before any provider is instantiated, so
    // PrismaClient can read DATABASE_URL. Paths resolve from the process cwd,
    // which is apps/api when launched via turbo or `pnpm --filter api`.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', join(process.cwd(), '..', '..', '.env')],
    }),
    AuthModule,
    PrismaModule,
    SalesModule,
    ExpensesModule,
    LoadManifestsModule,
    UploadsModule,
    UsersModule,
    CustomersModule,
    TrucksModule,
    DriverTruckAssignmentsModule,
    DriverCustomerAssignmentsModule,
    ProductsModule,
    PricesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
