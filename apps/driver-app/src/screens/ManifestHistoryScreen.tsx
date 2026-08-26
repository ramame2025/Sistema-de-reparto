import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { LoadManifestRecord } from '@distribuidor/shared';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

/**
 * Read-only list of every load manifest ("remito de carga") the logged-in
 * driver has submitted, newest first, off `GET /load-manifests/mine`.
 * HomeScreen already hits this endpoint but only to derive a "loaded today?"
 * boolean — this screen is the first to actually list the records. Same
 * screen-local fetch pattern as SalesHistoryScreen / AssignedCustomersScreen.
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Device-local date+time, same philosophy as TruckContext.localDay. */
const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

const totalCylinders = (items: LoadManifestRecord['items']): number =>
  items.reduce((sum, item) => sum + item.quantity, 0);

export function ManifestHistoryScreen() {
  const { api } = useAuth();

  const [manifests, setManifests] = useState<LoadManifestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const response = await api.get<LoadManifestRecord[]>('/load-manifests/mine', {
          cache: 'no-store',
        });
        if (!cancelled) {
          setManifests(response);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'No se pudo cargar tu historial de remitos.';
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
    <ScreenContainer testID="manifest-history-screen">
      <View style={styles.wrap}>
        <Text style={styles.fieldLabel}>Historial de remitos</Text>

        {error ? (
          <FeedbackBanner message={error} tone="error" />
        ) : loading ? (
          <View style={styles.loadingRow} testID="manifest-history-loading">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Cargando tu historial...</Text>
          </View>
        ) : manifests.length === 0 ? (
          <EmptyState
            title="Todavía no cargaste ningún remito"
            description="Cuando cargues el camión al inicio del día va a aparecer acá."
          />
        ) : (
          <FlatList
            testID="manifest-history-list"
            data={manifests}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.row} testID={`manifest-history-row-${item.id}`}>
                <View style={styles.rowTop}>
                  <Text style={styles.truck}>{item.truckCode ?? 'Sin camión'}</Text>
                  <Text style={styles.count}>{totalCylinders(item.items)} envases</Text>
                </View>
                <Text style={styles.meta}>{formatDateTime(item.createdAt)}</Text>
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
  truck: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  count: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  note: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
});
