import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { PaymentMethod } from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { useSync } from '../context/SyncContext';
import type { NewSaleStackParamList } from '../navigation/NewSaleStack';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

type SaleResultNavigationProp = NativeStackNavigationProp<NewSaleStackParamList, 'SaleResult'>;

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  qr: 'QR',
  tarjeta: 'Tarjeta',
};

/**
 * Lo que paso con la venta que se acaba de cargar, en una pantalla propia.
 *
 * La distincion entre las dos variantes no es decorativa: "enviada" quiere
 * decir que el servidor ya la tiene, y "guardada en el telefono" quiere decir
 * que todavia no. Un chofer que confunde la segunda con un error vuelve a
 * cargar la misma venta, y esa duplicada hay que anularla despues a mano. Por
 * eso la variante en cola dice explicitamente que no la cargue de nuevo, y no
 * ofrece editar: no hay nada del otro lado que editar todavia.
 */
export function SaleResultScreen() {
  const route = useRoute<RouteProp<NewSaleStackParamList, 'SaleResult'>>();
  const navigation = useNavigation<SaleResultNavigationProp>();
  const { daySummary, pendingSales } = useSync();

  const { outcome, customerName, total, paymentMethod } = route.params;
  const queuedCount = pendingSales.length;
  const sent = outcome === 'sent';

  const dayLine = [
    `${daySummary.activeCount} ${daySummary.activeCount === 1 ? 'venta' : 'ventas'}`,
    formatArs(daySummary.activeTotal),
    ...(queuedCount > 0 ? [`${queuedCount} en cola`] : []),
  ].join(' · ');

  return (
    <ScreenContainer testID="sale-result-screen" scroll>
      <View style={styles.hero}>
        <View style={[styles.badge, sent ? styles.badgeSent : styles.badgeQueued]}>
          <Ionicons
            name={sent ? 'checkmark' : 'cloud-upload-outline'}
            size={36}
            color={colors.surface}
          />
        </View>

        <Text style={styles.title}>{sent ? 'Venta enviada' : 'Guardada en el teléfono'}</Text>

        {sent ? (
          <Text style={styles.summary} testID="sale-result-summary">
            {customerName} · {formatArs(total)} · {PAYMENT_LABELS[paymentMethod]}
          </Text>
        ) : (
          <Text style={styles.summary} testID="sale-result-queued-hint">
            Sin señal. Se envía sola cuando vuelva la conexión — no la cargues de nuevo.
          </Text>
        )}
      </View>

      <Card style={styles.card}>
        {sent ? (
          <>
            <Text style={styles.cardLabel}>JORNADA</Text>
            <Text style={styles.cardValue} testID="sale-result-day">
              {dayLine}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.cardLabel}>EN COLA</Text>
            <Text style={styles.cardValue} testID="sale-result-queue">
              {queuedCount} {queuedCount === 1 ? 'venta esperando' : 'ventas esperando'}
            </Text>
          </>
        )}
      </Card>

      <Button
        label="Cargar otra venta"
        onPress={() => navigation.navigate('Sale')}
        testID="sale-result-new-sale"
      />

      {sent ? (
        // Editar y anular viven en el historial, sobre la venta elegida. Un
        // atajo que solo supiera actuar sobre "la ultima" seria justo el
        // problema que se saco de la pantalla de carga.
        <Text
          accessibilityRole="button"
          onPress={() => navigation.getParent()?.navigate('Inicio', { screen: 'SalesHistory' })}
          style={styles.link}
          testID="sale-result-edit-link"
        >
          Editar o anular
        </Text>
      ) : (
        <Text
          accessibilityRole="button"
          onPress={() => navigation.getParent()?.navigate('Sincronización')}
          style={styles.link}
          testID="sale-result-queue-link"
        >
          Ver cola de sincronización
        </Text>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSent: {
    backgroundColor: colors.success,
  },
  badgeQueued: {
    backgroundColor: colors.warning,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  summary: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  cardLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.7,
  },
  cardValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  link: {
    minHeight: MIN_TOUCH_TARGET,
    textAlignVertical: 'center',
    textAlign: 'center',
    paddingTop: spacing.md,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.secondary,
  },
});
