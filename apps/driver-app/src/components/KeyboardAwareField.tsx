import React, { createContext, useCallback, useContext, useRef, type RefObject } from 'react';
import type { ScrollView, TextInput } from 'react-native';

/**
 * El ScrollView de la pantalla, para que un campo pueda pedirle que lo traiga
 * a la vista. Lo publica `ScreenContainer`, que es quien lo crea.
 */
export const ScreenScrollContext = createContext<RefObject<ScrollView | null> | null>(null);

/** Aire entre el campo y el borde superior del teclado. */
const DEFAULT_OFFSET = 24;

/**
 * Props para un TextInput que tiene que quedar visible cuando sube el teclado.
 *
 * El campo avisa cuando se enfoca, en lugar de que el contenedor adivine quien
 * tiene el foco: `TextInput.State.currentlyFocusedInput()` es una dependencia
 * que puede devolver null y deja el problema sin sintoma que diagnosticar.
 *
 * El desplazamiento lo hace `scrollResponderScrollNativeHandleToKeyboard`, la
 * API que React Native trae para esto. Vale la pena delegarselo: el ScrollView
 * ya viene siguiendo la geometria del teclado por su cuenta, asi que funciona
 * igual con la ventana redimensionandose que con el teclado tapando (los dos
 * modos existen segun como este configurada la app, y en Expo Go no es la
 * configuracion de este proyecto la que manda). Ademas resuelve solo la carrera
 * de eventos: si las medidas del teclado todavia no llegaron, difiere el
 * scroll en vez de calcular con datos viejos.
 */
export function useKeyboardAwareField(extraOffset: number = DEFAULT_OFFSET) {
  const scrollRef = useContext(ScreenScrollContext);
  const fieldRef = useRef<TextInput>(null);

  const onFocus = useCallback(() => {
    const scroll = scrollRef?.current;
    const field = fieldRef.current;
    if (!scroll || !field) {
      return;
    }

    scroll.scrollResponderScrollNativeHandleToKeyboard(
      field as never,
      extraOffset,
      // Sin esto el contenido puede tirarse hacia abajo hasta pegar el campo
      // contra el teclado, dejando un hueco arriba.
      true,
    );
  }, [scrollRef, extraOffset]);

  return { ref: fieldRef, onFocus };
}

export type KeyboardAwareFieldProps = {
  children: (props: { ref: RefObject<TextInput | null>; onFocus: () => void }) => React.ReactNode;
};
