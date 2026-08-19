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
});
