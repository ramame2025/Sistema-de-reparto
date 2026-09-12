import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type CardHeaderProps = {
  title: string;
  /** Un renglon de contexto que respalda el titulo. */
  subtitle?: string;
  /**
   * El numero o la accion que encabeza la tarjeta, a la derecha. Va como nodo
   * y no como texto porque cada tarjeta decide su propio enfasis: un importe
   * cobrado pesa mas que un "quedan 29", y un estado vacio pone un boton.
   */
  trailing?: React.ReactNode;
  testID?: string;
};

/**
 * El encabezado comun de las tarjetas de la portada.
 *
 * Existe para que ninguna tarjeta se lea como mas importante que otra por
 * accidente: antes cada una traia su propio tamaño de titulo (un eyebrow gris
 * en una, un `md` en otra, un `lg` en la tercera), y esa diferencia se leia
 * como jerarquia donde no la hay. El enfasis lo pone lo que cada tarjeta tiene
 * para decir, nunca el tamaño de su titulo.
 */
export function CardHeader({ title, subtitle, trailing, testID }: CardHeaderProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.header} testID={testID}>
      <View style={styles.text}>
        <Text style={styles.title} testID={testID ? `${testID}-title` : undefined}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} testID={testID ? `${testID}-subtitle` : undefined}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
