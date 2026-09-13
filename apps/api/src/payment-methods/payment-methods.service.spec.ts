import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ProofPolicy } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethodsService } from './payment-methods.service';

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

function buildPaymentMethodRow(
  overrides: Partial<PaymentMethodRow> = {},
): PaymentMethodRow {
  return {
    id: 'payment-method-1',
    code: 'efectivo',
    name: 'Efectivo',
    isActive: true,
    sortOrder: 0,
    proofPolicy: 'none',
    countsAsCash: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('PaymentMethodsService', () => {
  let service: PaymentMethodsService;
  let prisma: {
    paymentMethod: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      paymentMethod: {
        findMany: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PaymentMethodsService);
  });

  describe('listPaymentMethods', () => {
    it('returns only active methods by default', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([
        buildPaymentMethodRow(),
      ]);

      await service.listPaymentMethods();

      expect(prisma.paymentMethod.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    });

    it('includes inactive methods when asked', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([]);

      await service.listPaymentMethods({ includeInactive: true });

      expect(prisma.paymentMethod.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    });

    it('serializes the flags and the dates', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([
        buildPaymentMethodRow({
          code: 'transferencia',
          name: 'Transferencia',
          proofPolicy: 'optional',
          countsAsCash: false,
          sortOrder: 1,
        }),
      ]);

      const [record] = await service.listPaymentMethods();

      expect(record).toEqual({
        id: 'payment-method-1',
        code: 'transferencia',
        name: 'Transferencia',
        isActive: true,
        sortOrder: 1,
        proofPolicy: 'optional',
        countsAsCash: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('assertPaymentMethodCodesExist', () => {
    it('accepts a code that exists', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([{ code: 'efectivo' }]);

      await expect(
        service.assertPaymentMethodCodesExist(['efectivo']),
      ).resolves.toBeUndefined();
    });

    /**
     * La regla central del diseno: `isActive` decide que se OFRECE, no que se
     * ACEPTA. La venta ya se cobro en la calle; rechazarla aca la perderia.
     */
    it('accepts a code whose method was deactivated after the sale was queued', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([{ code: 'qr' }]);

      await expect(
        service.assertPaymentMethodCodesExist(['qr']),
      ).resolves.toBeUndefined();

      // La consulta no filtra por `isActive`: pregunta existencia, no vigencia.
      expect(prisma.paymentMethod.findMany).toHaveBeenCalledWith({
        where: { code: { in: ['qr'] } },
        select: { code: true },
      });
    });

    it('rejects an unknown code and names it in the message', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([]);

      await expect(
        service.assertPaymentMethodCodesExist(['cripto']),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.assertPaymentMethodCodesExist(['cripto']),
      ).rejects.toMatchObject({
        response: {
          message: 'Unknown paymentMethod: cripto',
          errors: ['paymentMethod cripto does not exist'],
        },
      });
    });

    it('deduplicates codes before querying', async () => {
      prisma.paymentMethod.findMany.mockResolvedValue([{ code: 'efectivo' }]);

      await service.assertPaymentMethodCodesExist(['efectivo', 'efectivo']);

      expect(prisma.paymentMethod.findMany).toHaveBeenCalledWith({
        where: { code: { in: ['efectivo'] } },
        select: { code: true },
      });
    });

    it('does not query at all for an empty list', async () => {
      await service.assertPaymentMethodCodesExist([]);

      expect(prisma.paymentMethod.findMany).not.toHaveBeenCalled();
    });
  });
});
