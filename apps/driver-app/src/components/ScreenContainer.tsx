import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
// React Native's own SafeAreaView is iOS-only: on Android it renders a plain
// View with no insets, leaving content behind the system status bar. This one
// resolves real insets on both platforms through the SafeAreaProvider mounted
// in App.tsx.
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export type ScreenContainerProps = {
  children: React.ReactNode;
  /** Agrega el padding de una pantalla larga. El scroll existe siempre. */
  scroll?: boolean;
  /**
   * Barra fija al pie, fuera del ScrollView. Para la accion principal de una
   * pantalla larga: en Nueva Venta el chofer tiene que poder guardar sin
   * bajar hasta el final de un catalogo que crece con cada producto que el
   * admin da de alta.
   */
  footer?: React.ReactNode;
  /**
   * Habilita el gesto de tirar para recargar. Reemplaza al boton de
   * "Actualizar" que las portadas solian llevar: el dato puede quedar viejo
   * igual, pero el gesto no ocupa lugar en la pantalla.
   */
  onRefresh?: () => void;
  refreshing?: boolean;
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
  footer,
  onRefresh,
  refreshing = false,
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
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>

        {footer ? (
          <View testID={testID ? `${testID}-footer` : undefined}>{footer}</View>
        ) : null}
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
