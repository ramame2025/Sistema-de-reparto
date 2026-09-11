import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type LoadingRowProps = {
  /** "Cargando tu historial...", "Actualizando resumen...". */
  label: string;
  testID?: string;
};

/**
 * Spinner + texto en fila. Estaba copiado identico (`loadingRow` +
 * `loadingText`) en seis pantallas.
 */
export function LoadingRow({ label, testID }: LoadingRowProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row} testID={testID}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
});
