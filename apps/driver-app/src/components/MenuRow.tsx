import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type MenuRowProps = {
  title: string;
  /**
   * Dato al margen derecho, en lugar del chevron: para una fila que informa
   * ("Actualizada 07:05") y no para una que lleva a otro lado.
   */
  value?: string;
  /** Sin `onPress` la fila no se puede tocar y no muestra chevron. */
  onPress?: () => void;
  /**
   * La fila existe pero todavia no hace nada. Se ve apagada y no responde al
   * toque: una fila que se ve igual que el resto y no pasa nada al tocarla le
   * miente al chofer.
   */
  disabled?: boolean;
  testID?: string;
};

/** Fila del menu del chofer: que es, y a donde lleva o que dato trae. */
export function MenuRow({ title, value, onPress, disabled = false, testID }: MenuRowProps) {
  const interactive = Boolean(onPress) && !disabled;

  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={disabled ? { disabled: true } : undefined}
      disabled={!interactive}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={[styles.title, disabled ? styles.dimmed : null]}>{title}</Text>

      <View style={styles.trailing}>
        {value ? <Text style={styles.value}>{value}</Text> : null}
        {interactive ? (
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    // Separador entre filas: el menu es una lista continua, no cards sueltas.
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    flexShrink: 1,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  dimmed: {
    color: colors.textSecondary,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  value: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});
