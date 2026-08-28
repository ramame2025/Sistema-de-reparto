import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PaymentMethod, SaleRecord } from '@distribuidor/shared';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

/**
 * Read-only list of every sale the logged-in driver has recorded, newest
 * first, straight off `GET /sales/mine` (already driver-scoped and
 * `createdAt desc` on the server). Same screen-local fetch pattern as
 * AssignedCustomersScreen — plain useState/useEffect, no Context, since only
 * this screen consumes the full list. No pagination this pass: the endpoint
 * returns the driver's whole history unfiltered; flagged as future debt if a
 * driver ever accumulates months of rows.
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Device-local date+time, same philosophy as TruckContext.localDay. */
const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  qr: 'QR',
  tarjeta: 'Tarjeta',
};

type SalesHistoryNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'SalesHistory'>;

export function SalesHistoryScreen() {
  const { api } = useAuth();
  const navigation = useNavigation<SalesHistoryNavigationProp>();

  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const response = await api.get<SaleRecord[]>('/sales/mine', { cache: 'no-store' });
        if (!cancelled) {
          setSales(response);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'No se pudo cargar tu historial de ventas.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount only
  }, []);

  return (
    <ScreenContainer testID="sales-history-screen">
      <View style={styles.wrap}>
        <Text style={styles.fieldLabel}>Historial de ventas</Text>

        {error ? (
          <FeedbackBanner message={error} tone="error" />
        ) : loading ? (
          <View style={styles.loadingRow} testID="sales-history-loading">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Cargando tu historial...</Text>
          </View>
        ) : sales.length === 0 ? (
          <EmptyState
            title="Todavía no registraste ventas"
            description="Cuando cargues una venta va a aparecer acá."
          />
        ) : (
          <FlatList
            testID="sales-history-list"
            data={sales}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              // The whole row is the tap target into edit/cancel. It carries
              // the fetched record along so the detail screen needs no second
              // request — and still opens with no signal.
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('SaleDetail', { sale: item })}
                style={styles.row}
                testID={`sales-history-row-${item.id}`}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.customer}>{item.customerName}</Text>
                  <Text style={styles.total}>${item.total.toLocaleString('es-AR')}</Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.meta}>{formatDateTime(item.createdAt)}</Text>
                  {item.kind === 'churn' ? (
                    <Text style={styles.badgeChurn}>Devolución de envase</Text>
                  ) : item.paymentMethod ? (
                    <Text style={styles.meta}>{PAYMENT_METHOD_LABELS[item.paymentMethod]}</Text>
                  ) : null}
                  {item.status === 'canceled' ? (
                    <Text style={styles.badgeCanceled}>Anulada</Text>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  customer: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  total: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  badgeCanceled: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.error,
    textTransform: 'uppercase',
  },
  badgeChurn: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
});
