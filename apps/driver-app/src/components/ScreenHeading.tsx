import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type ScreenHeadingProps = {
  /**
   * Renglon chico en mayusculas arriba del titulo -- "DISTRIBUIDOR · APP
   * CHOFER". Antes era `styles.tag`, copiado verbatim en Login, Sync y
   * LoadManifest.
   */
  eyebrow?: string;
  /** Titulo de la pantalla -- "Historial de ventas", "Cargar camión". */
  title?: string;
  testID?: string;
};

/**
 * Encabezado plano y comun para las pantallas que no tienen uno rico
 * (JornadaHeader / SaleHeader / ExpenseHeader siguen siendo suyos). Unifica
 * los tratamientos sueltos: el `tag` repetido y los titulos en `fieldLabel`
 * pelado de las pantallas de historial.
 */
export function ScreenHeading({ eyebrow, title, testID }: ScreenHeadingProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap} testID={testID}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
});
