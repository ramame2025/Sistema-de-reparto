import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { CustomerRecord, MyAssignedCustomersResponse } from '@distribuidor/shared';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { LoadingRow } from '../components/LoadingRow';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionLabel } from '../components/SectionLabel';
import { useAuth } from '../context/AuthContext';
import { localDay } from '../context/TruckContext';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

/**
 * Phase 4 (PR4, docs/plans/live-dashboard-assigned-customers.md, Sub-change
 * B): read-only view of today's admin-assigned customer list. Screen-local
 * fetch, not a Context (design decision #10) — mirrors HomeScreen's
 * `refreshManifestStatus` pattern exactly: plain `useState`+`useEffect`, no
 * shared state, since only this screen and HomeScreen's status card consume
 * this data this phase. Never navigates into the Nueva Venta tab's
 * CustomerPickerScreen (design decision #14, out of scope) — this is a
 * plain, no-search, no-proximity list; the driver decides on their own to
 * switch tabs if they want to sell to someone on it.
 */
export function AssignedCustomersScreen() {
  const { api } = useAuth();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const today = localDay();
        const response = await api.get<MyAssignedCustomersResponse>(
          `/driver-customer-assignments/me?date=${today}`,
          { cache: 'no-store' },
        );
        if (!cancelled) {
          setCustomers(response.customers);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'No se pudo cargar tu lista de clientes de hoy.';
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
    <ScreenContainer testID="assigned-customers-screen" scroll>
      <Card style={styles.card}>
        <SectionLabel variant="field">Clientes de hoy</SectionLabel>

        {error ? (
          <FeedbackBanner message={error} tone="error" />
        ) : loading ? (
          <LoadingRow label="Cargando clientes de hoy..." testID="assigned-customers-loading" />
        ) : customers.length === 0 ? (
          <EmptyState
            title="No tenes clientes asignados hoy"
            description="El administrador todavia no armo tu lista de visitas de hoy."
          />
        ) : (
          <FlatList
            testID="assigned-customers-list"
            data={customers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.customerRow} testID={`assigned-customer-${item.id}`}>
                <Text style={styles.customerName}>{item.name}</Text>
                <Text style={styles.customerType}>{item.customerType}</Text>
              </View>
            )}
          />
        )}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  customerName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  customerType: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});
