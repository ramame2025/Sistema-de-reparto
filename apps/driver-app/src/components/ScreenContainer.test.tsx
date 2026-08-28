import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { ScreenContainer } from './ScreenContainer';
import { colors } from '../theme/colors';

describe('ScreenContainer', () => {
  it('renders its children', async () => {
    await render(
      <ScreenContainer>
        <Text>Contenido de pantalla</Text>
      </ScreenContainer>
    );
    expect(screen.getByText('Contenido de pantalla')).toBeTruthy();
  });

  it('applies the theme background color', async () => {
    await render(
      <ScreenContainer testID="screen">
        <Text>Contenido</Text>
      </ScreenContainer>
    );
    const container = screen.getByTestId('screen');
    const flatStyle = StyleSheet.flatten(container.props.style);
    expect(flatStyle.backgroundColor).toBe(colors.background);
  });

  it('lets the content scroll even on a screen that is not marked as scrollable', async () => {
    // Sin esto, en una pantalla corta (el login) el teclado tapa el input y no
    // hay forma de correr la vista para verlo.
    await render(
      <ScreenContainer testID="screen">
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    expect(screen.getByTestId('screen-scroll')).toBeTruthy();
  });

  it('keeps a short screen laid out as if it filled the viewport', async () => {
    // `flexGrow: 1` es lo que permite que el login siga centrado verticalmente
    // pese a estar ahora dentro de un ScrollView.
    await render(
      <ScreenContainer testID="screen">
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    const style = StyleSheet.flatten(
      screen.getByTestId('screen-scroll').props.contentContainerStyle
    );
    expect(style.flexGrow).toBe(1);
  });

  it('handles the first tap while the keyboard is open instead of only dismissing it', async () => {
    // Con el valor por defecto, el primer toque sobre un boton solo cierra el
    // teclado y hay que tocar dos veces para que la accion ocurra.
    await render(
      <ScreenContainer testID="screen">
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    expect(screen.getByTestId('screen-scroll').props.keyboardShouldPersistTaps).toBe(
      'handled'
    );
  });

  it('wraps the content in a KeyboardAvoidingView so the focused input stays visible', async () => {
    await render(
      <ScreenContainer testID="screen">
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    expect(screen.getByTestId('screen-keyboard-avoid')).toBeTruthy();
  });
});
