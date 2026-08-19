import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { StatusBadge } from '../components/StatusBadge';
import { useSync } from '../context/SyncContext';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

/**
 * Relocated (and expanded) from the pre-PR5 App.tsx "Estado de
 * sincronizacion" card, which only surfaced an aggregate pending count and a
 * single global "Sincronizar pendientes" button — the offline queue itself
 * had no dedicated surface (the symptom named in the original proposal).
 * This screen keeps that same single manual-retry action
 * (`syncPendingSales(true)` — design's SyncScreen consumer contract:
 * `pendingSales`, `syncing`, `syncPendingSales(true)`, retry-only, no
 * discard, owner-confirmed) but additionally renders each queued sale's own
 * queued time / retry count / last error, so a driver can tell WHY a
 * specific sale is stuck instead of only how many are pending. Retrying is
 * global by design (mirrors the original's single button) — it happens to
 * also cover the case of "retry a single stuck sale" once its backoff
 * window has passed, since `syncPendingSales(true)` attempts every queued
 * entry regardless of `nextRetryAt`.
 */
export function SyncScreen() {
  const { pendingSales, syncing, syncPendingSales } = useSync();

  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');

  const showMessage = (text: string, tone: FeedbackTone) => {
    setMessage(text);
    setMessageTone(tone);
  };

  const handleRetry = async () => {
    try {
      const outcome = await syncPendingSales(true);
      if (outcome.skipped) {
        showMessage('No hay ventas pendientes para sincronizar.', 'info');
        return;
      }
      showMessage(
        `Sincronizacion finalizada. Enviadas: ${outcome.synced}. Pendientes: ${outcome.remaining}.`,
        outcome.remaining === 0 ? 'success' : 'warning',
      );
    } catch {
      showMessage('No se pudo sincronizar la cola offline.', 'error');
    }
  };

  return (
    <ScreenContainer testID="sync-screen" scroll>
      <Text style={styles.tag}>Distribuidor · App chofer</Text>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Cola de sincronizacion</Text>

        {pendingSales.length === 0 ? (
          <EmptyState
            title="No hay ventas pendientes"
            description="Todas las ventas fueron sincronizadas con el servidor."
          />
        ) : (
          <View style={styles.list}>
            {pendingSales.map((entry) => (
              <Card
                key={entry.queueId}
                style={styles.entryCard}
                testID={`sync-entry-${entry.queueId}`}
              >
                <Text style={styles.entryTitle}>{entry.payload.customerName}</Text>
                <Text style={styles.entryLine}>
                  En cola desde: {new Date(entry.createdAt).toLocaleTimeString('es-AR')}
                </Text>
                <Text style={styles.entryLine}>Intentos: {entry.retries}</Text>
                {entry.lastError ? (
                  <StatusBadge
                    label={entry.lastError}
                    status="error"
                    testID={`sync-entry-error-${entry.queueId}`}
                  />
                ) : null}
              </Card>
            ))}
          </View>
        )}

        <Button
          label={syncing ? 'Sincronizando...' : 'Reintentar ahora'}
          onPress={() => void handleRetry()}
          disabled={syncing}
          testID="sync-retry-button"
        />
        <FeedbackBanner message={message} tone={messageTone} />
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
  list: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  entryCard: {
    gap: spacing.xs,
  },
  entryTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  entryLine: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
});
