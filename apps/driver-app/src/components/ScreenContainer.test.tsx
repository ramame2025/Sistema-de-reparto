import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { ScreenContainer } from './ScreenContainer';
import { ScreenScrollContext } from './KeyboardAwareField';
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

  it('renders a footer pinned outside the scrollable area', async () => {
    // La barra de total y accion no puede scrollear con el contenido: el
    // chofer tiene que poder guardar la venta sin bajar hasta el final.
    await render(
      <ScreenContainer testID="screen" footer={<Text>Guardar venta</Text>}>
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    const footer = screen.getByTestId('screen-footer');
    expect(footer).toBeTruthy();
    expect(within(footer).getByText('Guardar venta')).toBeTruthy();
    expect(within(screen.getByTestId('screen-scroll')).queryByText('Guardar venta')).toBeNull();
  });

  it('renders no footer slot when the screen has no footer', async () => {
    await render(
      <ScreenContainer testID="screen">
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    expect(screen.queryByTestId('screen-footer')).toBeNull();
  });

  it('offers pull-to-refresh when the screen knows how to reload itself', async () => {
    const onRefresh = jest.fn();
    await render(
      <ScreenContainer testID="screen" onRefresh={onRefresh} refreshing={false}>
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    const control = screen.getByTestId('screen-scroll').props.refreshControl;
    expect(control).toBeTruthy();
    control.props.onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('has no refresh control on a screen that has nothing to reload', async () => {
    await render(
      <ScreenContainer testID="screen">
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    expect(screen.getByTestId('screen-scroll').props.refreshControl).toBeUndefined();
  });

  it('leaves headroom below the last field so the scroll can clear the keyboard', async () => {
    await render(
      <ScreenContainer testID="screen" scroll>
        <Text>Contenido</Text>
      </ScreenContainer>
    );

    const style = StyleSheet.flatten(
      screen.getByTestId('screen-scroll').props.contentContainerStyle
    );
    // El ultimo campo no puede subir mas alla del final del contenido: sin este
    // colchon el scroll topa justo antes de despejarlo del teclado.
    expect(style.paddingBottom).toBeGreaterThan(style.padding);
  });

  it('publishes its scroll view so a field can ask to be brought above the keyboard', async () => {
    // El desplazamiento lo pide el propio campo, via useKeyboardAwareField.
    // Aca solo se verifica que el contenedor deje el ScrollView disponible.
    let received: unknown = 'not-provided';

    function Probe() {
      received = React.useContext(ScreenScrollContext);
      return <Text>Contenido</Text>;
    }

    await render(
      <ScreenContainer testID="screen">
        <Probe />
      </ScreenContainer>
    );

    expect(received).not.toBe('not-provided');
    expect(received).not.toBeNull();
  });
});
