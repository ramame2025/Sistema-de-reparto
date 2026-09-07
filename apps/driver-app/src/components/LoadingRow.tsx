import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
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
  return (
    <View style={styles.row} testID={testID}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
