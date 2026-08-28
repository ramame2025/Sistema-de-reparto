import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing, MIN_TOUCH_TARGET } from '../theme/spacing';

const ICON_SIZE = 22;

export type PasswordInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmitEditing?: () => void;
  testID?: string;
};

/**
 * Campo de contrasena con un ojito para revelarla. En el celular, escribir una
 * password a ciegas con el pulgar es la causa mas comun de un login fallido
 * que despues se busca del lado del servidor.
 */
export function PasswordInput({
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  testID,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onSubmitEditing={onSubmitEditing}
        secureTextEntry={!visible}
        // El teclado del celular capitaliza la primera letra por defecto y
        // corrige palabras: con una password eso rompe el login en silencio.
        autoCapitalize="none"
        autoCorrect={false}
        testID={testID}
      />
      <Pressable
        accessibilityRole="button"
        // La etiqueta nombra la ACCION, no el estado: es lo que un lector de
        // pantalla necesita anunciar antes de que la persona toque.
        accessibilityLabel={visible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
        onPress={() => setVisible((current) => !current)}
        testID={testID ? `${testID}-toggle` : undefined}
        style={styles.toggle}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={ICON_SIZE}
          color={colors.textSecondary}
          testID={testID ? `${testID}-toggle-icon` : undefined}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggle: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
