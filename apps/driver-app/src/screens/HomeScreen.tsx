import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useSync } from '../context/SyncContext';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

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

  useEffect(() => {
    void refreshDaySummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once on mount only, matches the original's mount-time fetch
  }, []);

  const isEmpty = daySummary.activeCount === 0 && daySummary.canceledCount === 0;

  return (
    <ScreenContainer testID="home-screen" scroll>
      <Text style={styles.tag}>Distribuidor · App chofer</Text>
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
