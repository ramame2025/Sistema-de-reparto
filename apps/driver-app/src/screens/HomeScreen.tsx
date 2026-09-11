import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MyAssignedCustomersResponse, MyTruckStockResponse } from '@distribuidor/shared';
import { Card } from '../components/Card';
import { DayStatusCard } from '../components/DayStatusCard';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { JornadaHeader } from '../components/JornadaHeader';
import { LoadingRow } from '../components/LoadingRow';
import { ProgressBar } from '../components/ProgressBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionLabel } from '../components/SectionLabel';
import { StatTile } from '../components/StatTile';
import { SummaryRow } from '../components/SummaryRow';
import { TruckStockCard } from '../components/TruckStockCard';
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
import { buildTruckStockLines } from '../services/truckStock';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';
import { formatJornada } from '../utils/jornada';

type HomeScreenNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

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
  const { prices, products } = useCatalog();
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

  const [truckStock, setTruckStock] = useState<MyTruckStockResponse | null>(null);
  const [truckStockError, setTruckStockError] = useState<string | null>(null);

  const refreshTruckStock = useCallback(async () => {
    try {
      // El servidor ya resuelve el camion desde el token y devuelve el remito
      // de hoy junto con lo que queda: son la misma pregunta, y separarlas
      // dejaria a la portada pintando dos respuestas de instantes distintos.
      const response = await api.get<MyTruckStockResponse>(
        `/load-manifests/my-stock?date=${localDay()}`,
        { cache: 'no-store' },
      );
      setTruckStock(response);
      setTruckStockError(null);
    } catch (error) {
      // Visible-error posture, same as summaryError — no silent catch.
      const message =
        error instanceof Error ? error.message : 'No se pudo verificar el remito de hoy.';
      setTruckStockError(message);
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
    void refreshTruckStock();
    void refreshAssignedCustomersStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once on mount only, matches the original's mount-time fetch
  }, []);

  const problems = useMemo(
    () => buildDayProblems(pendingSales, todaySales ?? [], prices),
    [pendingSales, todaySales, prices],
  );

  /**
   * Lo que el servidor sabe, menos lo que todavia no le llego. Sin descontar
   * la cola, la tarjeta le miente al chofer justo cuando mas la necesita: sin
   * senal, con ventas ya hechas que el servidor no vio.
   */
  const truckStockLines = useMemo(
    () =>
      buildTruckStockLines(
        truckStock?.stock?.lines ?? [],
        pendingSales,
        products,
        truckStock?.date ?? localDay(),
      ),
    [truckStock, pendingSales, products],
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
    void refreshTruckStock();
    void refreshAssignedCustomersStatus();
  }, [refreshDaySummary, refreshTruckStock, refreshAssignedCustomersStatus]);

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
        truckKind={truck?.kind}
      />

      {summaryError ? (
        <FeedbackBanner message={summaryError} tone="error" />
      ) : summaryLoading ? (
        <LoadingRow label="Actualizando resumen..." testID="home-summary-loading" />
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
            <SectionLabel>COBRADO HOY</SectionLabel>
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

      {truckStockError ? (
        <View testID="home-manifest-error">
          <FeedbackBanner message={truckStockError} tone="error" />
        </View>
      ) : (
        <TruckStockCard
          lines={truckStockLines}
          manifestAt={truckStock?.stock?.manifestAt ?? null}
          onLoadManifest={() => navigation.navigate('LoadManifest')}
          onPress={() => navigation.navigate('ManifestHistory')}
          testID="home-truck-stock"
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
  // La separacion ENTRE cards la pone el `gap` de ScreenContainer.
  card: {
    gap: spacing.sm,
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
  // La zona de cuenta/sesion se separa a proposito mas que el resto: cierra la
  // pantalla y no compite con el contenido del dia.
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
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
