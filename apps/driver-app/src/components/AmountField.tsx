import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type AmountFieldProps = {
  value: number;
  onChange: (value: number) => void;
  testID?: string;
};

/** Los saltos que cubren casi toda la carga real: nafta, peaje, una comida. */
const QUICK_ADDS = [5000, 10000, 20000] as const;

const groupDigits = (value: number): string =>
  value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * El monto del gasto, que es el dato central de la pantalla y por eso se
 * escribe grande.
 *
 * Un cero se muestra como campo vacio: arrancar con "0" obliga al chofer a
 * borrarlo antes de tipear, y si se olvida termina cargando "045000". Los
 * atajos suman sobre lo que ya hay en vez de reemplazarlo, para poder componer
 * un importe a los toques sin abrir el teclado.
 */
export function AmountField({ value, onChange, testID }: AmountFieldProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.currency}>$</Text>
        <TextInput
          style={styles.input}
          value={value === 0 ? '' : groupDigits(value)}
          onChangeText={(text) => onChange(Number(text.replace(/\D/g, '')) || 0)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.border}
          testID={testID ? `${testID}-input` : undefined}
        />
      </View>

      <View style={styles.quickRow}>
        {QUICK_ADDS.map((step) => (
          <Pressable
            key={step}
            accessibilityRole="button"
            onPress={() => onChange(value + step)}
            style={styles.chip}
            testID={testID ? `${testID}-add-${step}` : undefined}
          >
            <Text style={styles.chipLabel}>+${groupDigits(step)}</Text>
          </Pressable>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(0)}
          style={styles.chip}
          testID={testID ? `${testID}-clear` : undefined}
        >
          <Text style={styles.chipLabel}>Borrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderLeftColor: colors.primary,
    borderLeftWidth: 3,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currency: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  input: {
    flex: 1,
    fontSize: 32,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    padding: 0,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: spacing.sm,
  },
  chipLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
});
