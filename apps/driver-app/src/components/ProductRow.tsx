import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

export type ProductRowProps = {
  code: string;
  name: string;
  /**
   * Absent when this phone holds no price for the product under the current
   * customer type. The row still renders so the catalog reads complete, but
   * without a number the driver could mistake for a real one.
   */
  unitPrice?: number;
  quantity: number;
  /**
   * Prefijo de los testIDs de la fila. La misma fila aparece ahora en tres
   * listas de la pantalla de venta -- lo vendido, los envases que vuelven y
   * los cambios por falla -- y sin prefijo las tres publicarian el mismo
   * identificador para el mismo producto.
   */
  testIDPrefix?: string;
  onIncrement: () => void;
  onDecrement: () => void;
};

/**
 * One line of the catalog: code, what it is, what it costs, and the two
 * controls that move the quantity. The minus is inert at zero rather than
 * hidden, so the row never changes width as the driver taps.
 */
export function ProductRow({
  code,
  name,
  unitPrice,
  quantity,
  testIDPrefix = 'product-row',
  onIncrement,
  onDecrement,
}: ProductRowProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const canDecrement = quantity > 0;
  const testID = `${testIDPrefix}-${code}`;
  const subtitle = unitPrice === undefined ? name : `${name} · ${formatArs(unitPrice)}`;

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.text}>
        <Text style={styles.code}>{code}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Quitar una unidad de ${code}`}
          accessibilityState={{ disabled: !canDecrement }}
          disabled={!canDecrement}
          onPress={onDecrement}
          testID={`${testID}-decrement`}
          style={styles.decrement}
        >
          <Text style={[styles.decrementLabel, !canDecrement && styles.mutedLabel]}>−</Text>
        </Pressable>

        <Text
          style={[styles.quantity, quantity === 0 && styles.mutedLabel]}
          testID={`${testID}-quantity`}
        >
          {quantity}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Agregar una unidad de ${code}`}
          onPress={onIncrement}
          testID={`${testID}-increment`}
          style={styles.increment}
        >
          <Text style={styles.incrementLabel}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
  },
  code: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  decrement: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: spacing.sm,
    backgroundColor: colors.surface,
  },
  decrementLabel: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  mutedLabel: {
    color: colors.border,
  },
  quantity: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  increment: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing.sm,
    backgroundColor: colors.secondary,
  },
  incrementLabel: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.onPrimary,
  },
});
