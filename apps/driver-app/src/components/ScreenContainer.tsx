import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export type ScreenContainerProps = {
  children: React.ReactNode;
  /** Agrega el padding de una pantalla larga. El scroll existe siempre. */
  scroll?: boolean;
  testID?: string;
};

/**
 * Contenedor comun de todas las pantallas. Resuelve una sola vez el problema
 * del teclado tapando el campo que se esta escribiendo, que en un celular es
 * la diferencia entre poder cargar una venta y no poder.
 *
 * El contenido va SIEMPRE dentro de un ScrollView, incluso en pantallas cortas
 * como el login: cuando el teclado sube, el area visible se achica y sin scroll
 * no hay forma de traer el input a la vista. `flexGrow: 1` mantiene el layout
 * de esas pantallas igual que antes (centrado vertical con `flex: 1`).
 */
export function ScreenContainer({
  children,
  scroll = false,
  testID,
}: ScreenContainerProps) {
  return (
    <SafeAreaView testID={testID} style={styles.container}>
      <KeyboardAvoidingView
        testID={testID ? `${testID}-keyboard-avoid` : undefined}
        style={styles.container}
        // iOS empuja el contenido con padding; en Android el redimensionado lo
        // hace la ventana (`softwareKeyboardLayoutMode: "resize"` en app.json),
        // y agregar padding encima duplicaria el desplazamiento.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID={testID ? `${testID}-scroll` : undefined}
          contentContainerStyle={[
            styles.content,
            scroll ? styles.padded : null,
          ]}
          // Sin esto el primer toque sobre un boton solo cierra el teclado, y
          // hay que tocar dos veces para que la accion ocurra.
          keyboardShouldPersistTaps="handled"
          // Deja el campo enfocado visible sobre el teclado (iOS).
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="on-drag"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
  },
  padded: {
    padding: spacing.md,
  },
});
