import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PasswordInput } from './PasswordInput';
import { colors } from '../theme/colors';

const renderInput = (props: Partial<React.ComponentProps<typeof PasswordInput>> = {}) =>
  render(
    <PasswordInput
      value="secreto"
      onChangeText={jest.fn()}
      placeholder="Password"
      testID="pwd"
      {...props}
    />
  );

describe('PasswordInput', () => {
  it('hides the text by default', async () => {
    await render(
      <PasswordInput value="secreto" onChangeText={jest.fn()} testID="pwd" />
    );

    expect(screen.getByTestId('pwd').props.secureTextEntry).toBe(true);
  });

  it('reveals the text when the eye is pressed, and hides it again on a second press', async () => {
    await renderInput();

    await fireEvent.press(screen.getByTestId('pwd-toggle'));
    expect(screen.getByTestId('pwd').props.secureTextEntry).toBe(false);

    await fireEvent.press(screen.getByTestId('pwd-toggle'));
    expect(screen.getByTestId('pwd').props.secureTextEntry).toBe(true);
  });

  it('announces what the button does, not what the state is', async () => {
    // Un lector de pantalla necesita la ACCION ("mostrar"), no el estado.
    await renderInput();

    const toggle = screen.getByTestId('pwd-toggle');
    expect(toggle.props.accessibilityLabel).toBe('Mostrar contrasena');

    await fireEvent.press(toggle);
    expect(screen.getByTestId('pwd-toggle').props.accessibilityLabel).toBe(
      'Ocultar contrasena'
    );
  });

  it('never autocorrects or autocapitalizes a password', async () => {
    // Con autocapitalize activo el teclado del celular cambia la primera letra
    // y el login falla sin que se vea por que.
    await renderInput();

    const input = screen.getByTestId('pwd');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
  });

  it('forwards typing to onChangeText', async () => {
    const onChangeText = jest.fn();
    await renderInput({ onChangeText });

    await fireEvent.changeText(screen.getByTestId('pwd'), 'nueva');

    expect(onChangeText).toHaveBeenCalledWith('nueva');
  });

  it('keeps the value visible after toggling, so nothing is retyped', async () => {
    await renderInput({ value: 'secreto' });

    await fireEvent.press(screen.getByTestId('pwd-toggle'));

    expect(screen.getByTestId('pwd').props.value).toBe('secreto');
  });

  it('runs onSubmitEditing when the keyboard submit is pressed', async () => {
    const onSubmitEditing = jest.fn();
    await renderInput({ onSubmitEditing });

    await fireEvent(screen.getByTestId('pwd'), 'submitEditing');

    expect(onSubmitEditing).toHaveBeenCalled();
  });

  it('uses a monochrome eye icon that flips to a crossed-out eye', async () => {
    // Ionicons, la misma familia que ya usan las tabs. Nada de emojis: el emoji
    // lo dibuja el sistema operativo y se ve distinto en cada telefono.
    await renderInput();

    expect(screen.getByTestId('pwd-toggle-icon').props.name).toBe('eye-outline');

    await fireEvent.press(screen.getByTestId('pwd-toggle'));

    expect(screen.getByTestId('pwd-toggle-icon').props.name).toBe('eye-off-outline');
  });

  it('tints the icon with the theme color instead of a hardcoded value', async () => {
    await renderInput();

    expect(screen.getByTestId('pwd-toggle-icon').props.color).toBe(colors.textSecondary);
  });
});
