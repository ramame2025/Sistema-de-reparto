import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MyAssignedCustomersResponse, MyTruckStockResponse } from '@distribuidor/shared';
import { Card } from '../components/Card';
import { CardHeader } from '../components/CardHeader';
import { DayStatusCard } from '../components/DayStatusCard';
import { DriverMenu } from '../components/DriverMenu';
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
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';
import { formatClock, formatJornada } from '../utils/jornada';

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
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    daySummary,
    summaryLoading,
    summaryError,
    refreshDaySummary,
    pendingSales,
    todaySales,
    lastSyncAt,
  } = useSync();
  const { truck } = useTruck();
  const { prices, products, fetchedAt } = useCatalog();
  const { api, username, logout } = useAuth();
  const navigation = useNavigation<HomeScreenNavigationProp>();

  // Logout is fully implemented in AuthContext (clears the token, flips
  // `status` to 'anonymous', RootNavigator unmounts MainTabs on its own —
  // load-manifest.md design decision #2). The offline queue lives under a
  // SEPARATE AsyncStorage key that `logout()` does NOT touch, so queued sales
  // survive a logout — but they will not sync again until the driver signs
  // back in on this phone, which is worth warning about before a stray tap.
  const [menuOpen, setMenuOpen] = useState(false);

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

  /** Ultimo remito de hoy, o null. Ya viene con el stock: no se vuelve a pedir. */
  const manifestAt = truckStock?.stock?.manifestAt ?? null;

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
      header={
        <JornadaHeader
          testID="home-jornada-header"
          jornada={formatJornada(new Date())}
          driverName={username}
          truckCode={truck?.code}
          truckPlate={truck?.plate}
          truckKind={truck?.kind}
          onPressMenu={() => setMenuOpen(true)}
        />
      }
    >
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
        <CardHeader
          title="Cobrado hoy"
          subtitle={`${daySummary.activeCount} ${
            daySummary.activeCount === 1 ? 'venta' : 'ventas'
          }`}
          trailing={
            <Text style={styles.cobrado} testID="home-cobrado-hoy">
              {formatArs(daySummary.activeTotal)}
            </Text>
          }
          testID="home-cobrado-header"
        />

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
          manifestAt={manifestAt}
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
          <CardHeader
            title="Clientes de hoy"
            trailing={
              <Text style={styles.clientsCount} testID="home-clients-progress">
                {visitedCount} de {assignedCustomerIds.length} visitados
              </Text>
            }
            testID="home-clients-header"
          />
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

      <DriverMenu
        testID="home-driver-menu"
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        driverName={username}
        truckCode={truck?.code}
        truckPlate={truck?.plate}
        priceListUpdatedAt={fetchedAt ? (formatClock(fetchedAt) ?? undefined) : undefined}
        appVersion={Constants.expoConfig?.version ?? undefined}
        lastSyncAt={lastSyncAt ? (formatClock(lastSyncAt) ?? undefined) : undefined}
        manifestLoadedAt={manifestAt ? (formatClock(manifestAt) ?? undefined) : undefined}
        onPressManifest={() => {
          // Cerrar primero: el Modal tapa la pantalla entera, y navegar por
          // detras dejaria al chofer mirando el menu sobre la pantalla nueva.
          setMenuOpen(false);
          // Con remito cargado la pregunta es "que cargue", no "que cargo":
          // abrir el formulario en blanco escondia lo que ya estaba hecho.
          navigation.navigate(manifestAt ? 'ManifestHistory' : 'LoadManifest');
        }}
        onPressPriceList={() => {
          setMenuOpen(false);
          navigation.navigate('PriceList');
        }}
        onPressLogout={handleLogout}
      />
    </ScreenContainer>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  // La separacion ENTRE cards la pone el `gap` de ScreenContainer.
  card: {
    gap: spacing.sm,
  },
  cobrado: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  clientsCount: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
});
