import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { radii } from '../theme/radii';
import { typography } from '../theme/typography';

export type JornadaHeaderProps = {
  /** Ya formateada, p. ej. "JUEVES 27/08". */
  jornada: string;
  driverName: string;
  truckCode?: string;
  truckPlate?: string;
  /** Un camion de cobertura no es el habitual del chofer: se dice. */
  truckKind?: 'titular' | 'cobertura';
  /** Sin handler no hay boton: las otras barras oscuras no tienen menu. */
  onPressMenu?: () => void;
  testID?: string;
};

/**
 * Barra oscura de Inicio: que dia es, quien maneja y en que camion. Los tres
 * datos que el chofer necesita para saber que la app esta mirando su jornada
 * y no la de ayer.
 */
export function JornadaHeader({
  jornada,
  driverName,
  truckCode,
  truckPlate,
  truckKind,
  onPressMenu,
  testID,
}: JornadaHeaderProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const hasTruck = Boolean(truckCode);

  return (
    <View testID={testID} style={styles.bar}>
      <View style={styles.text}>
        <Text style={styles.jornada}>JORNADA · {jornada}</Text>
        <Text style={styles.driver}>{hasTruck ? `${driverName} · ${truckCode}` : driverName}</Text>

        {hasTruck ? (
          <Text style={styles.truck}>
            {truckPlate}
            {truckKind === 'cobertura' ? ' · cobertura' : ''}
          </Text>
        ) : (
          <Text style={styles.noTruck} testID="jornada-header-no-truck">
            Sin camión asignado para hoy
          </Text>
        )}
      </View>

      {onPressMenu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir menú"
          onPress={onPressMenu}
          style={styles.menuButton}
          testID="jornada-header-menu"
        >
          <Ionicons name="menu" size={24} color={colors.onPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  text: {
    flexShrink: 1,
    gap: 2,
  },
  menuButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
  },
  jornada: {
    color: colors.onPrimary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.7,
    opacity: 0.85,
  },
  driver: {
    color: colors.onPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  truck: {
    color: colors.onPrimary,
    fontSize: typography.sizes.xs,
    opacity: 0.8,
  },
  noTruck: {
    color: colors.onPrimary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
});
