import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  PAYMENT_METHODS,
  type PaymentMethod,
  type SaleRecord,
  type UpdateSaleInput,
  validateUpdateSaleInput,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ProductRow } from '../components/ProductRow';
import { ScreenContainer } from '../components/ScreenContainer';
import { SegmentedPills } from '../components/SegmentedPills';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { ApiError } from '../services/apiClient';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

type SaleDetailNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'SaleDetail'>;

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  final: 'Final',
  comercio: 'Comercio',
  distribuidor: 'Distribuidor',
};

const PAYMENT_OPTIONS = PAYMENT_METHODS.map((method) => ({
  value: method,
  label: method === 'transferencia' ? 'Transf.' : method === 'qr' ? 'QR' : method === 'tarjeta' ? 'Tarjeta' : 'Efectivo',
}));

const pad = (value: number): string => String(value).padStart(2, '0');

/** Device-local date+time, same philosophy as TruckContext.localDay. */
const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

/**
 * Edit and cancel, moved off NewSaleScreen and onto one concrete sale.
 *
 * The old placement could only ever act on `lastSaleId`, a variable held in
 * memory by the New Sale screen: closing the app made every sale of the day
 * unfixable, and an edit shipped whatever happened to be typed into that
 * form at the time rather than the sale's own contents. Here both actions
 * are bound to the row the driver opened, prefilled from that row.
 *
 * The record arrives as a navigation param straight from the history list,
 * which already fetched it in full — no second round trip for data the app
 * is already holding.
 */
export function SaleDetailScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'SaleDetail'>>();
  const navigation = useNavigation<SaleDetailNavigationProp>();
  const { api, username } = useAuth();
  const { refreshDaySummary } = useSync();

  const sale = route.params.sale;
  const isChurn = sale.kind === 'churn';
  const isCanceled = sale.status === 'canceled';
  const isEditable = !isCanceled && !isChurn;

  // Unit prices come from the sale itself, never from today's price table:
  // re-pricing a March sale at August's rates is exactly what the API's
  // `getPriceTableAt(existing.occurredAt)` refuses to do server-side.
  const unitPrices = useMemo(() => {
    const table: Record<string, number> = {};
    sale.items.forEach((item) => {
      table[item.productCode] = item.unitPrice;
    });
    return table;
  }, [sale.items]);

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    sale.items.forEach((item) => {
      initial[item.productCode] = item.quantity;
    });
    return initial;
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    sale.paymentMethod ?? 'efectivo',
  );
  const [editReason, setEditReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');

  const showMessage = (text: string, tone: FeedbackTone) => {
    setMessage(text);
    setMessageTone(tone);
  };

  // A product taken down to zero leaves the sale entirely: the API replaces
  // the item set wholesale, so a `quantity: 0` line would be a validation
  // error rather than a removal.
  const editedItems = useMemo(
    () =>
      sale.items
        .filter((item) => (quantities[item.productCode] ?? 0) > 0)
        .map((item) => ({
          productCode: item.productCode,
          quantity: quantities[item.productCode],
        })),
    [sale.items, quantities],
  );

  const total = useMemo(
    () =>
      editedItems.reduce(
        (sum, item) => sum + (unitPrices[item.productCode] ?? 0) * item.quantity,
        0,
      ),
    [editedItems, unitPrices],
  );

  const changeQty = (productCode: string, delta: number) => {
    setQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, (previous[productCode] ?? 0) + delta),
    }));
  };

  const saveEdit = async () => {
    setMessage(null);

    if (!editReason || editReason.trim().length < 3) {
      showMessage('El motivo de edicion debe tener al menos 3 caracteres.', 'error');
      return;
    }

    if (editedItems.length === 0) {
      showMessage('La venta tiene que quedar con al menos un producto.', 'error');
      return;
    }

    const payload: UpdateSaleInput = {
      driverName: username,
      truckCode: sale.truckCode,
      customerName: sale.customerName,
      customerType: sale.customerType,
      paymentMethod,
      items: editedItems,
      reason: editReason,
      // Omitido (no la key) si la venta nunca estuvo enganchada a un cliente
      // del padron. Mandarlo cuando existe es lo que evita que la edicion le
      // borre el vinculo: la API reescribe `customerId` con lo que reciba.
      ...(sale.customerId ? { customerId: sale.customerId } : {}),
    };

    const validationErrors = validateUpdateSaleInput(payload);
    if (validationErrors.length > 0) {
      showMessage(validationErrors[0], 'error');
      return;
    }

    try {
      setSaving(true);
      await api.patch<SaleRecord>(`/sales/${sale.id}`, payload);
      showMessage('Venta editada correctamente.', 'success');
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : 'No se pudo editar la venta.';
      showMessage(cause, 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelSale = async () => {
    setMessage(null);

    if (!cancelReason || cancelReason.trim().length < 3) {
      showMessage('El motivo de anulacion debe tener al menos 3 caracteres.', 'error');
      return;
    }

    try {
      setCanceling(true);
      await api.patch<SaleRecord>(`/sales/${sale.id}/cancel`, { reason: cancelReason });
      showMessage('Venta anulada correctamente.', 'success');
      setCancelReason('');
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : 'No se pudo anular la venta.';
      showMessage(cause, 'error');
    } finally {
      setCanceling(false);
    }
  };

  return (
    <ScreenContainer testID="sale-detail-screen" scroll>
      <Card style={styles.card}>
        <Text style={styles.customer}>{sale.customerName}</Text>
        <Text style={styles.meta}>
          {CUSTOMER_TYPE_LABELS[sale.customerType] ?? sale.customerType}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatDateTime(sale.occurredAt)}</Text>
          {sale.truckCode ? <Text style={styles.meta}>{sale.truckCode}</Text> : null}
        </View>
        <Text style={styles.total} testID="sale-detail-total">
          {formatArs(total)}
        </Text>

        {isChurn && (
          <Text style={styles.churn} testID="sale-detail-churn">
            Visita sin venta — el cliente devolvio el envase y no compro nada.
          </Text>
        )}

        {isCanceled && (
          <View testID="sale-detail-canceled">
            <Text style={styles.canceledTag}>ANULADA</Text>
            {sale.cancelReason ? <Text style={styles.meta}>{sale.cancelReason}</Text> : null}
          </View>
        )}
      </Card>

      {sale.items.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.fieldLabel}>Productos</Text>
          {sale.items.map((item) => (
            <ProductRow
              key={item.productCode}
              code={item.productCode}
              name={item.productCode}
              unitPrice={item.unitPrice}
              quantity={quantities[item.productCode] ?? 0}
              onIncrement={() => isEditable && changeQty(item.productCode, 1)}
              onDecrement={() => isEditable && changeQty(item.productCode, -1)}
            />
          ))}
        </Card>
      )}

      {isEditable && (
        <Card style={styles.card}>
          <Text style={styles.fieldLabel}>Cobro</Text>
          <SegmentedPills
            options={PAYMENT_OPTIONS}
            value={paymentMethod}
            onChange={setPaymentMethod}
            testID="sale-detail-payment"
          />

          <Text style={styles.fieldLabel}>Motivo de la edicion</Text>
          <TextInput
            style={styles.input}
            value={editReason}
            onChangeText={setEditReason}
            placeholder="Por que cambia esta venta"
            testID="sale-detail-edit-reason"
          />
          <Button
            label={saving ? 'Guardando...' : 'Guardar cambios'}
            onPress={() => void saveEdit()}
            disabled={saving}
            testID="sale-detail-save-button"
          />
        </Card>
      )}

      {!isCanceled && (
        <Card style={styles.card}>
          <Text style={styles.fieldLabel}>Anular esta venta</Text>
          <TextInput
            style={styles.input}
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder="Motivo de anulacion"
            testID="sale-detail-cancel-reason"
          />
          <Button
            label={canceling ? 'Anulando...' : 'Anular venta'}
            variant="secondary"
            onPress={() => void cancelSale()}
            disabled={canceling}
            testID="sale-detail-cancel-button"
          />
        </Card>
      )}

      <FeedbackBanner message={message} tone={messageTone} />

      <Button
        label="Volver al historial"
        variant="secondary"
        onPress={() => navigation.goBack()}
        testID="sale-detail-back-button"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  customer: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  total: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  churn: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  canceledTag: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.error,
    letterSpacing: 0.7,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
});
