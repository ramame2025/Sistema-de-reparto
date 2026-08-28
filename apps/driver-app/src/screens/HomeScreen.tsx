import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LoadManifestRecord, MyAssignedCustomersResponse } from '@distribuidor/shared';
import { Card } from '../components/Card';
import { DayStatusCard } from '../components/DayStatusCard';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { JornadaHeader } from '../components/JornadaHeader';
import { ProgressBar } from '../components/ProgressBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { StatTile } from '../components/StatTile';
import { SummaryRow } from '../components/SummaryRow';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useSync } from '../context/SyncContext';
import { localDay, useTruck } from '../context/TruckContext';
import type { HomeStackParamList } from '../navigation/HomeStack';
import {
  buildDayProblems,
  countVisitedCustomers,
  type SaleProblem,
} from '../services/dayProblems';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';
import { formatJornada } from '../utils/jornada';

type HomeScreenNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

const pad = (value: number): string => String(value).padStart(2, '0');

/** Hora local del remito, para el renglon "Hoy 07:10". */
const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const sumManifestUnits = (manifest: LoadManifestRecord): number =>
  manifest.items.reduce((sum, item) => sum + item.quantity, 0);

/**
 * Portada de la jornada. Responde tres preguntas en orden de urgencia: hay algo
 * roto, cuanto se cobro, y como viene el recorrido.
 *
 * El bloque de problemas es lo unico que puede empujar al chofer a actuar antes
 * de cerrar el dia, asi que va primero y en rojo. Junta dos cosas distintas que
 * para el chofer son la misma ("esta venta no esta bien todavia"): las que
 * siguen en la cola del telefono y las que se cobraron sin efectivo y quedaron
 * sin comprobante. El comprobante sigue siendo opcional al cobrar -- esto es un
 * recordatorio al cierre, no una validacion.
 */
export function HomeScreen() {
  const {
    daySummary,
    summaryLoading,
    summaryError,
    refreshDaySummary,
    pendingSales,
    todaySales,
  } = useSync();
  const { truck } = useTruck();
  const { prices } = useCatalog();
  const { api, username, logout } = useAuth();
  const navigation = useNavigation<HomeScreenNavigationProp>();

  // Logout is fully implemented in AuthContext (clears the token, flips
  // `status` to 'anonymous', RootNavigator unmounts MainTabs on its own —
  // load-manifest.md design decision #2). The offline queue lives under a
  // SEPARATE AsyncStorage key that `logout()` does NOT touch, so queued sales
  // survive a logout — but they will not sync again until the driver signs
  // back in on this phone, which is worth warning about before a stray tap.
  const handleLogout = useCallback(() => {
    const pendingCount = pendingSales.length;
    const message =
      pendingCount > 0
        ? `Tenés ${pendingCount} ${
            pendingCount === 1 ? 'venta' : 'ventas'
          } sin sincronizar. No se van a enviar hasta que vuelvas a iniciar sesión en este teléfono.`
        : '¿Seguro que querés cerrar la sesión?';

    Alert.alert('Cerrar sesión', message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  }, [logout, pendingSales.length]);

  const [manifest, setManifest] = useState<LoadManifestRecord | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);

  const refreshManifestStatus = useCallback(async () => {
    try {
      const manifests = await api.get<LoadManifestRecord[]>('/load-manifests/mine', {
        cache: 'no-store',
      });
      const today = new Date().toISOString().slice(0, 10);
      // Se guarda el remito entero, no un booleano: la portada muestra cuantos
      // envases se cargaron y a que hora, y ambos datos ya venian en esta
      // misma respuesta.
      setManifest(
        manifests.find((entry) => entry.createdAt.slice(0, 10) === today) ?? null,
      );
      setManifestError(null);
    } catch (error) {
      // Visible-error posture, same as summaryError — no silent catch.
      const message =
        error instanceof Error ? error.message : 'No se pudo verificar el remito de hoy.';
      setManifestError(message);
    }
  }, [api]);

  const [assignedCustomerIds, setAssignedCustomerIds] = useState<string[]>([]);
  const [assignedCustomersError, setAssignedCustomersError] = useState<string | null>(null);

  const refreshAssignedCustomersStatus = useCallback(async () => {
    try {
      const today = localDay();
      const response = await api.get<MyAssignedCustomersResponse>(
        `/driver-customer-assignments/me?date=${today}`,
        { cache: 'no-store' },
      );
      setAssignedCustomerIds(response.customers.map((customer) => customer.id));
      setAssignedCustomersError(null);
    } catch (error) {
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

  const problems = useMemo(
    () => buildDayProblems(pendingSales, todaySales ?? [], prices),
    [pendingSales, todaySales, prices],
  );

  const visitedCount = useMemo(
    () => countVisitedCustomers(assignedCustomerIds, todaySales ?? []),
    [assignedCustomerIds, todaySales],
  );

  /**
   * Una venta que el servidor nunca recibio se arregla en la cola; una sin
   * comprobante, abriendo esa venta. Son dos destinos distintos porque son dos
   * problemas distintos, aunque la tarjeta los liste juntos.
   */
  const openProblem = (problem: SaleProblem) => {
    if (problem.kind === 'not-sent') {
      navigation.getParent()?.navigate('Sincronización');
      return;
    }

    const sale = (todaySales ?? []).find((entry) => entry.id === problem.id);
    if (sale) {
      navigation.navigate('SaleDetail', { sale });
    }
  };

  const resolveAll = () => {
    // "Resolver ahora" ataca primero lo que se puede perder: una venta que solo
    // existe en este telefono. Si no hay ninguna, lleva a la primera que
    // necesita comprobante.
    const first = problems[0];
    if (first) {
      openProblem(first);
    }
  };

  const refreshAll = useCallback(() => {
    void refreshDaySummary();
    void refreshManifestStatus();
    void refreshAssignedCustomersStatus();
  }, [refreshDaySummary, refreshManifestStatus, refreshAssignedCustomersStatus]);

  return (
    <ScreenContainer
      testID="home-screen"
      scroll
      onRefresh={refreshAll}
      refreshing={summaryLoading}
    >
      <JornadaHeader
        testID="home-jornada-header"
        jornada={formatJornada(new Date())}
        driverName={username}
        truckCode={truck?.code}
        truckPlate={truck?.plate}
        truckCapacity={truck?.capacity}
        truckKind={truck?.kind}
      />

      {summaryError ? (
        <FeedbackBanner message={summaryError} tone="error" />
      ) : summaryLoading ? (
        <View style={styles.loadingRow} testID="home-summary-loading">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Actualizando resumen...</Text>
        </View>
      ) : (
        <DayStatusCard
          testID="home-day-status"
          problems={problems}
          sentCount={daySummary.activeCount}
          onPressProblem={openProblem}
          onResolve={resolveAll}
        />
      )}

      <Card style={styles.card}>
        <View style={styles.cobradoRow}>
          <View>
            <Text style={styles.sectionLabel}>COBRADO HOY</Text>
            <Text style={styles.cobrado} testID="home-cobrado-hoy">
              {formatArs(daySummary.activeTotal)}
            </Text>
          </View>
          <Text style={styles.cobradoCount}>
            {daySummary.activeCount} {daySummary.activeCount === 1 ? 'venta' : 'ventas'}
          </Text>
        </View>

        <View style={styles.tiles}>
          <StatTile value={daySummary.activeCount} label="Activas" testID="home-tile-activas" />
          <StatTile
            value={daySummary.canceledCount}
            label="Anuladas"
            tone="error"
            testID="home-tile-anuladas"
          />
          <StatTile
            value={pendingSales.length}
            label="En cola"
            tone="warning"
            testID="home-tile-cola"
          />
        </View>

        <SummaryRow
          title="Ver todas las ventas de hoy"
          onPress={() => navigation.navigate('SalesHistory')}
          testID="home-sales-history-cta"
        />
      </Card>

      {manifestError ? (
        <View testID="home-manifest-error">
          <FeedbackBanner message={manifestError} tone="error" />
        </View>
      ) : manifest ? (
        <SummaryRow
          title={`Remito cargado · ${sumManifestUnits(manifest)} envases`}
          subtitle={`Hoy ${formatTime(manifest.createdAt)}`}
          onPress={() => navigation.navigate('ManifestHistory')}
          testID="home-manifest-loaded"
        />
      ) : (
        <SummaryRow
          title="Sin remito de carga"
          subtitle="Cargá el camión para que cierren los números"
          onPress={() => navigation.navigate('LoadManifest')}
          testID="home-manifest-missing"
        />
      )}

      {assignedCustomersError ? (
        <View testID="home-assigned-customers-error">
          <FeedbackBanner message={assignedCustomersError} tone="error" />
        </View>
      ) : (
        <Card style={styles.card}>
          <View style={styles.cobradoRow}>
            <Text style={styles.clientsTitle}>Clientes de hoy</Text>
            <Text style={styles.clientsCount} testID="home-clients-progress">
              {visitedCount} de {assignedCustomerIds.length} visitados
            </Text>
          </View>
          <ProgressBar
            current={visitedCount}
            total={assignedCustomerIds.length}
            testID="home-clients-bar"
          />
          <SummaryRow
            title="Ver clientes de hoy"
            onPress={() => navigation.navigate('AssignedCustomers')}
            testID="home-assigned-customers-cta"
          />
        </Card>
      )}

      <View style={styles.session}>
        <Text style={styles.sessionLine} testID="home-session-user">
          Sesión de {username}
        </Text>
        <Text
          accessibilityRole="button"
          onPress={handleLogout}
          style={styles.logout}
          testID="home-logout-button"
        >
          Cerrar sesión
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.7,
  },
  cobradoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cobrado: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  cobradoCount: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  clientsTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  clientsCount: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  sessionLine: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  logout: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.secondary,
    paddingVertical: spacing.sm,
  },
});
