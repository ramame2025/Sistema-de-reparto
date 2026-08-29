import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type StatTileTone = 'neutral' | 'warning' | 'error';

export type StatTileProps = {
  value: number;
  label: string;
  tone?: StatTileTone;
  testID?: string;
};

const TONE_COLORS: Record<StatTileTone, string> = {
  neutral: colors.textPrimary,
  warning: colors.warning,
  error: colors.error,
};

/**
 * Un numero de la jornada con su etiqueta.
 *
 * Un cero se pinta gris aunque su tono sea de alerta: "0 anuladas" es una
 * buena noticia, y pintarla de rojo haria que la fila entera se lea como un
 * problema. Solo destaca lo que efectivamente pide atencion.
 */
export function StatTile({ value, label, tone = 'neutral', testID }: StatTileProps) {
  const color = value === 0 ? colors.textSecondary : TONE_COLORS[tone];

  return (
    <View style={styles.tile} testID={testID}>
      <Text style={[styles.value, { color }]} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  value: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
  },
  label: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
