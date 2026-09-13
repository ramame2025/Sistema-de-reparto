import { BadRequestException, Injectable } from '@nestjs/common';
import type { PaymentMethodRecord, ProofPolicy } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type { PaymentMethodRecord };

export type ListPaymentMethodsOptions = {
  /** El duenio ve todos; el chofer solo los vigentes. */
  includeInactive?: boolean;
};

type PaymentMethodRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  proofPolicy: ProofPolicy;
  countsAsCash: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Solo lectura, a proposito. No hay `create` ni `update` (ver D3 del plan):
 * un medio de pago mal configurado deja a los choferes sin poder cobrar, asi
 * que las altas y los cambios de bandera se hacen por migracion y no por
 * pantalla.
 */
@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPaymentMethods(
    options: ListPaymentMethodsOptions = {},
  ): Promise<PaymentMethodRecord[]> {
    // Mismo orden que las categorias: `sortOrder` manda y el nombre desempata,
    // asi las filas que nunca se reordenaron no salen en el orden arbitrario
    // en que la base las devuelva.
    const methods: PaymentMethodRow[] =
      await this.prisma.paymentMethod.findMany({
        where: options.includeInactive ? {} : { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

    return methods.map((method) => this.toRecord(method));
  }

  /**
   * Verifica que cada codigo exista en la tabla. Deliberadamente NO exige que
   * este activo, igual que `CustomerCategoriesService.assertCategoryCodesExist`
   * y por el mismo motivo: ese string llega dentro de una venta que el
   * telefono encolo ANTES de que el medio se diera de baja, y la plata ya se
   * cobro. Rechazarla perderia una venta real.
   *
   * `isActive` decide que se le OFRECE al chofer, no que se le acepta.
   */
  async assertPaymentMethodCodesExist(codes: string[]): Promise<void> {
    const distinct = [...new Set(codes)];
    if (distinct.length === 0) {
      return;
    }

    const found: { code: string }[] = await this.prisma.paymentMethod.findMany({
      where: { code: { in: distinct } },
      select: { code: true },
    });
    const known = new Set(found.map((row) => row.code));
    const unknown = distinct.filter((code) => !known.has(code));

    if (unknown.length > 0) {
      // El codigo culpable va en el mensaje, no solo en `errors`: quien lee un
      // log o un banner tiene que saber CUAL fallo sin abrir el JSON.
      throw new BadRequestException({
        message: `Unknown paymentMethod: ${unknown.join(', ')}`,
        errors: unknown.map((code) => `paymentMethod ${code} does not exist`),
      });
    }
  }

  private toRecord(method: PaymentMethodRow): PaymentMethodRecord {
    return {
      id: method.id,
      code: method.code,
      name: method.name,
      isActive: method.isActive,
      sortOrder: method.sortOrder,
      proofPolicy: method.proofPolicy,
      countsAsCash: method.countsAsCash,
      createdAt: method.createdAt.toISOString(),
      updatedAt: method.updatedAt.toISOString(),
    };
  }
}
