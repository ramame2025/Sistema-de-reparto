import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CUSTOMER_TYPES,
  DEFAULT_PRICE_TABLE,
  PAYMENT_METHODS,
  PRODUCT_CODES,
  calculateSaleTotal,
  type CreateSaleInput,
  type CustomerType,
  type PaymentMethod,
  type ProductCode,
  type SaleRecord,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useTruck } from '../context/TruckContext';
import { ApiError } from '../services/apiClient';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const EMPTY_QUANTITIES: Record<ProductCode, number> = {
  G10: 0,
  G15: 0,
  G45: 0,
  G15_AUTO: 0,
};

const buildClientGeneratedId = () =>
  `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

type SegmentButtonProps<T extends string> = {
  label: T;
  active: boolean;
  onPress: () => void;
};

function SegmentButton<T extends string>({ label, active, onPress }: SegmentButtonProps<T>) {
  return <Button label={label} variant={active ? 'primary' : 'secondary'} onPress={onPress} />;
}

/**
 * Relocated verbatim from the pre-PR5 App.tsx "Cliente"/"Productos"/save/
 * "Editar ultima venta"/"Anular ultima venta" cards. El camion ya no se tipea:
 * sale de `TruckContext`, que resuelve la asignacion vigente del chofer para
 * hoy, y sin camion la pantalla no deja cargar ventas. Cancel/edit now go through
 * `AuthContext.api` directly (design's NewSaleScreen consumer contract)
 * instead of raw `fetch`. No field/validation/copy redesign — only the
 * transport (context hooks + shared components) changed.
 */
export function NewSaleScreen() {
  const { trySendSale, enqueueSale, refreshDaySummary } = useSync();
  const { api, username } = useAuth();
  const { truck, status: truckStatus, error: truckError } = useTruck();

  const [customerType, setCustomerType] = useState<CustomerType>('final');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [customerName, setCustomerName] = useState('Cliente de prueba');
  const [quantities, setQuantities] = useState<Record<ProductCode, number>>(EMPTY_QUANTITIES);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editReason, setEditReason] = useState('Correccion de carga');
  const [canceling, setCanceling] = useState(false);
  const [updating, setUpdating] = useState(false);

  const currentItems = useMemo(
    () =>
      PRODUCT_CODES.filter((code) => quantities[code] > 0).map((code) => ({
        productCode: code,
        quantity: quantities[code],
      })),
    [quantities],
  );

  const total = useMemo(
    () => calculateSaleTotal(customerType, currentItems, DEFAULT_PRICE_TABLE),
    [customerType, currentItems],
  );

  const changeQty = (productCode: ProductCode, delta: number) => {
    setQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, previous[productCode] + delta),
    }));
  };

  const showMessage = (text: string, tone: FeedbackTone) => {
    setMessage(text);
    setMessageTone(tone);
  };

  const saveSale = async () => {
    setMessage(null);

    const payload: CreateSaleInput = {
      clientGeneratedId: buildClientGeneratedId(),
      driverName: username,
      truckId: truck?.truckId,
      truckCode: truck?.code,
      customerName,
      customerType,
      paymentMethod,
      items: currentItems,
    };

    // Sin camion asignado la venta quedaria sin unidad: se corta antes de
    // mandarla o encolarla.
    if (!truck) {
      showMessage('No podes cargar ventas sin un camion asignado para hoy.', 'error');
      return;
    }

    if (payload.items.length === 0) {
      showMessage('Agrega al menos un producto antes de guardar.', 'error');
      return;
    }

    try {
      setSaving(true);
      const saleId = await trySendSale(payload);
      setLastSaleId(saleId);
      showMessage(`Venta guardada correctamente. ID: ${saleId}`, 'success');
      setQuantities(EMPTY_QUANTITIES);
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'No se pudo guardar en API';
      const queueLength = await enqueueSale(payload, cause);
      showMessage(`Sin conexion. Venta en cola offline (${queueLength} pendientes).`, 'warning');
      setQuantities(EMPTY_QUANTITIES);
    } finally {
      setSaving(false);
    }
  };

  const cancelLastSale = async () => {
    if (!lastSaleId) {
      showMessage('Todavia no hay una venta para anular.', 'error');
      return;
    }

    if (!cancelReason || cancelReason.trim().length < 3) {
      showMessage('El motivo de anulacion debe tener al menos 3 caracteres.', 'error');
      return;
    }

    try {
      setCanceling(true);
      await api.patch<SaleRecord>(`/sales/${lastSaleId}/cancel`, { reason: cancelReason });
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

  const updateLastSale = async () => {
    if (!lastSaleId) {
      showMessage('Todavia no hay una venta para editar.', 'error');
      return;
    }

    if (!editReason || editReason.trim().length < 3) {
      showMessage('El motivo de edicion debe tener al menos 3 caracteres.', 'error');
      return;
    }

    const payload = {
      driverName: username,
      truckId: truck?.truckId,
      truckCode: truck?.code,
      customerName,
      customerType,
      paymentMethod,
      items: currentItems,
      reason: editReason,
    };

    if (payload.items.length === 0) {
      showMessage('Agrega al menos un producto para editar la venta.', 'error');
      return;
    }

    try {
      setUpdating(true);
      await api.patch<SaleRecord>(`/sales/${lastSaleId}`, payload);
      showMessage('Venta editada correctamente.', 'success');
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : 'No se pudo editar la venta.';
      showMessage(cause, 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <ScreenContainer testID="new-sale-screen" scroll>
      <Text style={styles.tag}>Distribuidor · App chofer</Text>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Cliente</Text>
        <Text style={styles.apiHint}>Chofer: {username}</Text>
        {truck && (
          <Text style={styles.assignedTruck} testID="new-sale-assigned-truck">
            Camion: {truck.code} · {truck.plate} · {truck.capacity} u.
            {truck.kind === 'cobertura' ? ' (cobertura)' : ''}
          </Text>
        )}
        {!truck && truckStatus === 'error' && (
          <Text style={styles.truckProblem} testID="new-sale-truck-error">
            {truckError} Revisa la conexion y volve a intentar.
          </Text>
        )}
        {!truck && truckStatus !== 'error' && truckStatus !== 'loading' && (
          <Text style={styles.truckProblem} testID="new-sale-no-truck">
            Hoy no tenes un camion asignado. Hablá con el administrador antes de
            cargar ventas.
          </Text>
        )}
        <TextInput
          style={styles.input}
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="Nombre del cliente"
        />

        <Text style={styles.fieldLabel}>Tipo de cliente</Text>
        <View style={styles.segmentRow}>
          {CUSTOMER_TYPES.map((type) => (
            <SegmentButton
              key={type}
              label={type}
              active={customerType === type}
              onPress={() => setCustomerType(type)}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Forma de pago</Text>
        <View style={styles.segmentRow}>
          {PAYMENT_METHODS.map((method) => (
            <SegmentButton
              key={method}
              label={method}
              active={paymentMethod === method}
              onPress={() => setPaymentMethod(method)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Productos</Text>
        {PRODUCT_CODES.map((code) => (
          <View key={code} style={styles.productRow}>
            <Text style={styles.productName}>{code}</Text>
            <View style={styles.qtyRow}>
              <Button
                label="-"
                variant="secondary"
                onPress={() => changeQty(code, -1)}
                testID={`new-sale-qty-decrement-${code}`}
              />
              <Text style={styles.qtyValue}>{quantities[code]}</Text>
              <Button
                label="+"
                variant="secondary"
                onPress={() => changeQty(code, 1)}
                testID={`new-sale-qty-increment-${code}`}
              />
            </View>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.total}>Total: ${total.toLocaleString('es-AR')}</Text>
        <Button
          label={saving ? 'Guardando...' : 'Guardar venta'}
          onPress={() => void saveSale()}
          disabled={saving}
        />
        <FeedbackBanner message={message} tone={messageTone} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Editar ultima venta</Text>
        <Text style={styles.apiHint}>
          ID ultima venta: {lastSaleId ?? 'sin ventas guardadas'}
        </Text>
        <TextInput
          style={styles.input}
          value={editReason}
          onChangeText={setEditReason}
          placeholder="Motivo de edicion"
        />
        <Button
          label={updating ? 'Actualizando...' : 'Editar ultima venta'}
          onPress={() => void updateLastSale()}
          disabled={updating}
          testID="new-sale-edit-button"
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Anular ultima venta</Text>
        <Text style={styles.apiHint}>
          ID ultima venta: {lastSaleId ?? 'sin ventas guardadas'}
        </Text>
        <TextInput
          style={styles.input}
          value={cancelReason}
          onChangeText={setCancelReason}
          placeholder="Motivo de anulacion"
        />
        <Button
          label={canceling ? 'Anulando...' : 'Anular ultima venta'}
          onPress={() => void cancelLastSale()}
          disabled={canceling}
          testID="new-sale-cancel-button"
        />
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tag: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.sm,
  },
  card: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  assignedTruck: {
    fontWeight: '600',
    marginBottom: 8,
  },
  truckProblem: {
    marginBottom: 8,
  },
  apiHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  productName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  total: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
});
