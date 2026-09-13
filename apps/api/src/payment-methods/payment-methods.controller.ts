import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { PaymentMethodsService } from './payment-methods.service';

type AuthRequest = Request & {
  user?: {
    role?: UserRole;
  };
};

@Controller('payment-methods')
@Roles('admin')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  @Roles('admin', 'chofer')
  async listPaymentMethods(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() req: AuthRequest,
  ) {
    // Un medio de pago dado de baja no se le ofrece al chofer bajo ninguna
    // circunstancia, aunque lo pida por query. Que no se OFREZCA no significa
    // que no se ACEPTE: una venta encolada que lo traiga se graba igual (ver
    // `assertPaymentMethodCodesExist`).
    const isAdmin = req.user?.role === 'admin';

    return this.paymentMethodsService.listPaymentMethods({
      includeInactive: isAdmin && includeInactive === 'true',
    });
  }
}
