import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LoadManifestRecord } from '@distribuidor/shared';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { LoadingRow } from '../components/LoadingRow';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeading } from '../components/ScreenHeading';
import { useAuth } from '../context/AuthContext';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
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
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { api } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ManifestHistory'>>();

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
        <ScreenHeading title="Historial de remitos" />

        {/*
          Un dia puede llevar mas de un remito: el chofer que vuelve al deposito
          al mediodia recarga, y el stock del dia los suma. Sin esta salida, el
          menu de Inicio lo dejaba mirando lo que ya cargo sin forma de sumar lo
          nuevo.
        */}
        <Button
          label="Cargar otro remito"
          variant="secondary"
          onPress={() => navigation.navigate('LoadManifest')}
          testID="manifest-history-load-cta"
        />

        {error ? (
          <FeedbackBanner message={error} tone="error" />
        ) : loading ? (
          <LoadingRow label="Cargando tu historial..." testID="manifest-history-loading" />
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

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  // Historial sin `scroll`: el FlatList es el unico contenedor scrolleable.
  // El `gap` iguala la separacion heading <-> lista al resto de la app.
  wrap: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.md,
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
