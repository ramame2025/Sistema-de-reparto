import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type SegmentedPillOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedPillsProps<T extends string> = {
  options: readonly SegmentedPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Deja que las pastillas ocupen lo que dicen y bajen de fila. Para grupos que
   * no entran en un renglon: cinco categorias de gasto estiradas dejarian
   * "Mantenimiento" ilegible al lado de "Peaje".
   */
  wrap?: boolean;
  /**
   * Cuantas pastillas como maximo comparten un renglon. Las que sobran bajan
   * de fila formando una grilla pareja.
   *
   * Es el punto medio entre los otros dos modos. Estiradas, cinco medios de
   * pago dejan "Cuenta corriente" ilegible; con `wrap`, cada pastilla mide lo
   * que dice y el borde derecho queda dentado. Acotando el renglon las filas
   * quedan parejas y el ancho no depende de cuanto mida el texto.
   *
   * Tiene prioridad sobre `wrap`, porque ya envuelve por definicion.
   */
  maxPerRow?: number;
  /**
   * Bloquea la fila entera: ninguna pastilla responde al toque y todas se
   * muestran apagadas.
   *
   * Existe para que un bloqueo sea VISIBLE. La alternativa era esconder el
   * grupo, y un control que desaparece deja al lector sin saber que habia ahi
   * ni por que ya no esta; una fila gris sigue diciendo que el cobro existe y
   * que ahora mismo no hay nada que cobrar.
   */
  disabled?: boolean;
  /** Each pill gets `${testID}-${option.value}`; the row gets `${testID}-row`. */
  testID?: string;
};

/**
 * Base en porcentaje que garantiza `columns` por renglon y ni una mas.
 *
 * Se divide por `columns + 1` y no por `columns`: con el divisor exacto, N
 * pastillas suman el 100% y los huecos entre ellas ya no entran, asi que la
 * ultima baja de fila. Con una columna imaginaria de mas sobra lugar para los
 * huecos, y `flexGrow` estira las N hasta llenar el renglon.
 */
const basisFor = (columns: number): `${number}%` => `${100 / (columns + 1)}%`;

/**
 * Single-choice row of pills. The unselected state is an outline, not a
 * second fill colour: two filled colours read as two live states, which is
 * exactly the confusion the old primary/secondary Button pair created on the
 * payment-method row.
 */
export function SegmentedPills<T extends string>({
  options,
  value,
  onChange,
  wrap = false,
  maxPerRow,
  disabled = false,
  testID,
}: SegmentedPillsProps<T>) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const grid = typeof maxPerRow === 'number' && maxPerRow > 0;
  const gridPill: ViewStyle | null = grid
    ? { flexBasis: basisFor(maxPerRow), flexGrow: 1 }
    : null;

  return (
    <View
      style={[styles.row, (wrap || grid) && styles.rowWrap]}
      testID={testID ? `${testID}-row` : undefined}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[
              styles.pill,
              grid || wrap ? styles.pillAuto : styles.pillStretch,
              gridPill,
              selected ? styles.pillSelected : styles.pillIdle,
              disabled && styles.pillDisabled,
            ]}
          >
            <Text
              style={[
                styles.label,
                selected ? styles.labelSelected : styles.labelIdle,
                disabled && styles.labelDisabled,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowWrap: {
    flexWrap: 'wrap',
  },
  pill: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: spacing.sm,
    borderWidth: 1,
  },
  pillStretch: {
    flex: 1,
  },
  pillAuto: {
    paddingHorizontal: spacing.md,
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  pillDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  labelSelected: {
    color: colors.onPrimary,
  },
  labelIdle: {
    color: colors.textPrimary,
  },
  labelDisabled: {
    color: colors.textSecondary,
  },
});
