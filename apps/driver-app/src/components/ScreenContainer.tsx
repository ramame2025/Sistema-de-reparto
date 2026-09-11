import React, { useMemo, useRef } from 'react';
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
import { StatusBar } from 'expo-status-bar';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { ScreenScrollContext } from './KeyboardAwareField';

export type ScreenContainerProps = {
  children: React.ReactNode;
  /** Agrega el padding de una pantalla larga. El scroll existe siempre. */
  scroll?: boolean;
  /**
   * Separacion vertical entre los hijos directos de la pantalla. Es el ritmo
   * que antes cada pantalla resolvia a mano y distinto: unas con `marginTop`,
   * otras con `marginBottom`, otras apoyandose en el margen de un label. Aca
   * queda en un solo lugar. `spacing.md` por defecto; pasar otro token, o 0
   * para que la pantalla maneje su propio espaciado.
   */
  gap?: number;
  /**
   * Barra oscura a sangre completa, fija arriba y FUERA del ScrollView.
   *
   * Va por prop y no como un hijo mas porque el padding de pantalla
   * (`scroll`) y el inset del status bar la dejaban flotando en una isla
   * clara: para llegar al borde del telefono tiene que vivir afuera del
   * contenido, no adentro. Este slot pinta su propio inset superior, asi que
   * el azul sube hasta el borde de arriba.
   */
  header?: React.ReactNode;
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
  gap = spacing.md,
  header,
  footer,
  onRefresh,
  refreshing = false,
  testID,
}: ScreenContainerProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);

  return (
    <ScreenScrollContext.Provider value={scrollRef}>
    <SafeAreaView
      testID={testID}
      style={styles.container}
      // Con header, el inset de arriba lo pinta el header y no el contenedor:
      // si lo tomara el SafeAreaView, la franja del status bar quedaria del
      // color claro del fondo y la barra oscura arrancaria mas abajo.
      edges={header ? ['left', 'right', 'bottom'] : undefined}
    >
      {header ? (
        <>
          {/* Iconos claros: sobre el azul oscuro del header, los oscuros que
              usa el resto de la app son invisibles. Al desmontarse la
              pantalla, vuelve el `dark` global de App.tsx. */}
          <StatusBar style="light" />
          <SafeAreaView
            testID={testID ? `${testID}-header` : undefined}
            edges={['top']}
            style={styles.header}
          >
            {header}
          </SafeAreaView>
        </>
      ) : null}

      <KeyboardAvoidingView
        testID={testID ? `${testID}-keyboard-avoid` : undefined}
        style={styles.container}
        // iOS empuja el contenido con padding; en Android el redimensionado lo
        // hace la ventana (`softwareKeyboardLayoutMode: "resize"` en app.json),
        // y agregar padding encima duplicaria el desplazamiento.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          testID={testID ? `${testID}-scroll` : undefined}
          contentContainerStyle={[
            styles.content,
            scroll ? styles.padded : null,
            gap ? { gap } : null,
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
    </ScreenScrollContext.Provider>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    // El mismo azul que pintan las barras: el inset de arriba es una
    // extension de la barra, no una franja aparte.
    backgroundColor: colors.primary,
  },
  content: {
    flexGrow: 1,
  },
  padded: {
    padding: spacing.md,
    // Mas aire abajo que a los costados, a proposito: el ultimo campo de un
    // formulario no puede subir mas alla del final del contenido. Sin este
    // colchon, el scroll queda topado justo antes de despejarlo del teclado y
    // el campo se ve a medias por unos pocos pixeles.
    paddingBottom: spacing.md + spacing.lg,
  },
});
