import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LoadManifestRecord, MyAssignedCustomersResponse } from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { localDay, useTruck } from '../context/TruckContext';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type HomeScreenNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

/**
 * Relocated verbatim from the pre-PR5 App.tsx "Resumen de jornada" card:
 * active/canceled counts, active total, and the manual "Actualizar resumen"
 * refresh button. `summaryError` is the NEW visible error state — the
 * original silently swallowed a failed refresh (design's Preserve vs New
 * table). The full sync queue/retry UI stays out of scope here and moves to
 * SyncScreen in PR9; Home only surfaces a lightweight pending-count
 * indicator per the design's HomeScreen consumer contract.
 */
export function HomeScreen() {
  const { daySummary, summaryLoading, summaryError, refreshDaySummary, pendingSales } = useSync();
  const { truck } = useTruck();
  const { api } = useAuth();
  const navigation = useNavigation<HomeScreenNavigationProp>();

  // Manifest status: fetched once on mount alongside refreshDaySummary, per
  // the design's HomeScreen consumer contract (docs/plans/load-manifest.md
  // §4 Interfaces). Filtered to "today" client-side with the exact same
  // criterion SyncContext.refreshDaySummary already uses for sales
  // (`createdAt.slice(0, 10) === today`) — no server-side "today" filter
  // exists for this endpoint, same as /sales/mine.
  const [manifestLoadedToday, setManifestLoadedToday] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);

  const refreshManifestStatus = useCallback(async () => {
    try {
      const manifests = await api.get<LoadManifestRecord[]>('/load-manifests/mine', {
        cache: 'no-store',
      });
      const today = new Date().toISOString().slice(0, 10);
      setManifestLoadedToday(manifests.some((manifest) => manifest.createdAt.slice(0, 10) === today));
      setManifestError(null);
    } catch (error) {
      // Visible-error posture, same as summaryError — no silent catch.
      const message =
        error instanceof Error ? error.message : 'No se pudo verificar el remito de hoy.';
      setManifestError(message);
    }
  }, [api]);

  // Clientes de hoy: fetched once on mount alongside the summary and
  // manifest status, per the same "screen-local fetch, not a Context"
  // pattern (docs/plans/live-dashboard-assigned-customers.md, Sub-change B,
  // design decision #10 — only this card + AssignedCustomersScreen consume
  // this data this phase).
  const [assignedCustomersCount, setAssignedCustomersCount] = useState(0);
  const [assignedCustomersError, setAssignedCustomersError] = useState<string | null>(null);

  const refreshAssignedCustomersStatus = useCallback(async () => {
    try {
      const today = localDay();
      const response = await api.get<MyAssignedCustomersResponse>(
        `/driver-customer-assignments/me?date=${today}`,
        { cache: 'no-store' },
      );
      setAssignedCustomersCount(response.customers.length);
      setAssignedCustomersError(null);
    } catch (error) {
      // Visible-error posture, same as summaryError/manifestError — no silent catch.
      const message =
        error instanceof Error ? error.message : 'No se pudo verificar tus clientes de hoy.';
      setAssignedCustomersError(message);
    }
  }, [api]);

  useEffect(() => {
    void refreshDaySummary();
    void refreshManifestStatus();
    void refreshAssignedCustomersStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once on mount only, matches the original's mount-time fetch
  }, []);

  const isEmpty = daySummary.activeCount === 0 && daySummary.canceledCount === 0;

  return (
    <ScreenContainer testID="home-screen" scroll>
      <Text style={styles.tag}>Distribuidor · App chofer</Text>
      {truck ? (
        <Text style={styles.assignedTruck} testID="home-assigned-truck">
          Hoy manejas el {truck.code} · {truck.plate}
          {truck.kind === 'cobertura' ? ' (cobertura)' : ''}
        </Text>
      ) : (
        <Text style={styles.assignedTruck} testID="home-no-truck">
          Hoy no tenes un camion asignado.
        </Text>
      )}
      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Resumen de jornada</Text>

        {summaryLoading ? (
          <View style={styles.loadingRow} testID="home-summary-loading">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Actualizando resumen...</Text>
          </View>
        ) : summaryError ? (
          <FeedbackBanner message={summaryError} tone="error" />
        ) : isEmpty ? (
          <EmptyState
            title="Sin ventas hoy"
            description="Todavia no registraste ventas en la jornada de hoy."
          />
        ) : (
          <>
            <Text style={styles.line}>Ventas activas hoy: {daySummary.activeCount}</Text>
            <Text style={styles.line}>Ventas anuladas hoy: {daySummary.canceledCount}</Text>
            <Text style={styles.total}>
              Total activo hoy: ${daySummary.activeTotal.toLocaleString('es-AR')}
            </Text>
          </>
        )}

        <Text style={styles.apiHint}>Pendientes de sincronizar: {pendingSales.length}</Text>

        <Button label="Actualizar resumen" onPress={() => void refreshDaySummary()} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Remito de carga</Text>

        {manifestError ? (
          <View testID="home-manifest-error">
            <FeedbackBanner message={manifestError} tone="error" />
          </View>
        ) : manifestLoadedToday ? (
          <Text style={styles.manifestLoaded} testID="home-manifest-loaded">
            Ya cargaste el remito hoy.
          </Text>
        ) : (
          <Text style={styles.manifestMissing} testID="home-manifest-missing">
            No cargaste el remito de hoy.
          </Text>
        )}

        <Button
          label="Cargar camión"
          variant="secondary"
          onPress={() => navigation.navigate('LoadManifest')}
          testID="home-manifest-cta"
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Clientes de hoy</Text>

        {assignedCustomersError ? (
          <View testID="home-assigned-customers-error">
            <FeedbackBanner message={assignedCustomersError} tone="error" />
          </View>
        ) : assignedCustomersCount > 0 ? (
          <Text style={styles.manifestLoaded} testID="home-assigned-customers-count">
            Tenes {assignedCustomersCount} clientes asignados hoy.
          </Text>
        ) : (
          <Text style={styles.manifestMissing} testID="home-assigned-customers-empty">
            No tenes clientes asignados hoy.
          </Text>
        )}

        <Button
          label="Ver clientes de hoy"
          variant="secondary"
          onPress={() => navigation.navigate('AssignedCustomers')}
          testID="home-assigned-customers-cta"
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
  },
  assignedTruck: {
    fontWeight: '600',
    marginBottom: 8,
  },
  manifestMissing: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  manifestLoaded: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: typography.weights.medium,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  line: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  total: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  apiHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
