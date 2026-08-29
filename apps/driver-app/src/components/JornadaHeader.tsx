import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type JornadaHeaderProps = {
  /** Ya formateada, p. ej. "JUEVES 27/08". */
  jornada: string;
  driverName: string;
  truckCode?: string;
  truckPlate?: string;
  truckCapacity?: number;
  /** Un camion de cobertura no es el habitual del chofer: se dice. */
  truckKind?: 'titular' | 'cobertura';
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
  truckCapacity,
  truckKind,
  testID,
}: JornadaHeaderProps) {
  const hasTruck = Boolean(truckCode);

  return (
    <View testID={testID} style={styles.bar}>
      <Text style={styles.jornada}>JORNADA · {jornada}</Text>
      <Text style={styles.driver}>{hasTruck ? `${driverName} · ${truckCode}` : driverName}</Text>

      {hasTruck ? (
        <Text style={styles.truck}>
          {truckPlate}
          {truckCapacity !== undefined ? ` · ${truckCapacity} u. de capacidad` : ''}
          {truckKind === 'cobertura' ? ' · cobertura' : ''}
        </Text>
      ) : (
        <Text style={styles.noTruck} testID="jornada-header-no-truck">
          Sin camión asignado para hoy
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 2,
  },
  jornada: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.7,
    opacity: 0.85,
  },
  driver: {
    color: colors.surface,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  truck: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    opacity: 0.8,
  },
  noTruck: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
});
