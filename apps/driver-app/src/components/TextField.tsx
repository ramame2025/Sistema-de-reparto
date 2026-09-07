import React from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { spacing } from '../theme/spacing';

export type TextFieldProps = TextInputProps;

/**
 * TextInput con el estilo comun de campo (borde, radio, padding, fondo).
 * Estaba copiado como `styles.input` en Login, Expenses, LoadManifest,
 * SaleDetail y CustomerPicker, cada uno con el mismo `borderRadius: 10`
 * suelto.
 *
 * Reenvia el ref al TextInput real para que siga funcionando con
 * `useKeyboardAwareField` (que necesita el handle nativo del campo).
 */
export const TextField = React.forwardRef<TextInput, TextFieldProps>(
  ({ style, placeholderTextColor, ...rest }, ref) => (
    <TextInput
      ref={ref}
      style={[styles.input, style]}
      placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
      {...rest}
    />
  ),
);

TextField.displayName = 'TextField';

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    minHeight: 44,
  },
});
