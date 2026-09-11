import React, { useMemo } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type SectionLabelVariant = 'section' | 'field';

export type SectionLabelProps = TextProps & {
  children: React.ReactNode;
  /**
   * `section` (default): eyebrow chico, gris, con tracking -- "COBRADO HOY",
   * "CATEGORÍA". `field`: titulo de bloque de formulario, mas grande y en el
   * color de texto principal -- "Productos", "Cobro".
   *
   * Antes cada pantalla redefinia estos dos estilos (`sectionLabel` /
   * `fieldLabel`) con los mismos valores copiados. Ahora salen de aca.
   */
  variant?: SectionLabelVariant;
};

export function SectionLabel({
  children,
  variant = 'section',
  style,
  ...rest
}: SectionLabelProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Text style={[styles[variant], style]} {...rest}>
      {children}
    </Text>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  section: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.7,
  },
  field: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
});
