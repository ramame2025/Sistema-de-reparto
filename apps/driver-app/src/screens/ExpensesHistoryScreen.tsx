import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { ExpenseCategory, ExpenseRecord } from '@distribuidor/shared';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

/**
 * Read-only list of every expense the logged-in driver has recorded, newest
 * first, off `GET /expenses/mine`. Unlike sales/manifests, that endpoint did
 * NOT exist before this change — the expenses controller only had an
 * admin-only `GET /expenses` — so it was added (mirroring
 * `SalesController.listMySales`) alongside this screen. Same screen-local
 * fetch pattern as SalesHistoryScreen; FlatList is the only scroll container
 * (no ScrollView wrapper) to avoid VirtualizedList nesting.
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Device-local date+time, same philosophy as TruckContext.localDay. */
const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  combustible: 'Combustible',
  peaje: 'Peaje',
  comida: 'Comida',
  mantenimiento: 'Mantenimiento',
  varios: 'Varios',
};

export function ExpensesHistoryScreen() {
  const { api } = useAuth();

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const response = await api.get<ExpenseRecord[]>('/expenses/mine', { cache: 'no-store' });
        if (!cancelled) {
          setExpenses(response);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'No se pudo cargar tu historial de gastos.';
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
    <ScreenContainer testID="expenses-history-screen">
      <View style={styles.wrap}>
        <Text style={styles.fieldLabel}>Historial de gastos</Text>

        {error ? (
          <FeedbackBanner message={error} tone="error" />
        ) : loading ? (
          <View style={styles.loadingRow} testID="expenses-history-loading">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Cargando tu historial...</Text>
          </View>
        ) : expenses.length === 0 ? (
          <EmptyState
            title="Todavía no registraste gastos"
            description="Cuando cargues un gasto va a aparecer acá."
          />
        ) : (
          <FlatList
            testID="expenses-history-list"
            data={expenses}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.row} testID={`expenses-history-row-${item.id}`}>
                <View style={styles.rowTop}>
                  <Text style={styles.category}>{CATEGORY_LABELS[item.category]}</Text>
                  <Text style={styles.amount}>${item.amount.toLocaleString('es-AR')}</Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.meta}>{formatDateTime(item.createdAt)}</Text>
                  {item.receiptRef ? (
                    <Text style={styles.receiptTag} testID={`expenses-history-receipt-${item.id}`}>
                      Con comprobante
                    </Text>
                  ) : null}
                </View>
                {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
              </View>
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
  category: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  amount: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  receiptTag: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.secondary,
  },
  note: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
});
