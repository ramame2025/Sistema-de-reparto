import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SegmentedPills } from './SegmentedPills';

const OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transf.' },
  { value: 'qr', label: 'QR' },
  { value: 'tarjeta', label: 'Tarjeta' },
] as const;

describe('SegmentedPills', () => {
  it('renders one pill per option', async () => {
    await render(
      <SegmentedPills options={OPTIONS} value="efectivo" onChange={() => {}} testID="cobro" />,
    );
    OPTIONS.forEach((option) => {
      expect(screen.getByText(option.label)).toBeTruthy();
    });
  });

  it('marks the selected option as selected for assistive tech', async () => {
    await render(
      <SegmentedPills options={OPTIONS} value="transferencia" onChange={() => {}} testID="cobro" />,
    );
    expect(screen.getByTestId('cobro-transferencia').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('cobro-efectivo').props.accessibilityState.selected).toBe(false);
  });

  it('reports the picked value', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedPills options={OPTIONS} value="efectivo" onChange={onChange} testID="cobro" />,
    );
    await fireEvent.press(screen.getByTestId('cobro-qr'));
    expect(onChange).toHaveBeenCalledWith('qr');
  });
});

describe('SegmentedPills/varias filas', () => {
  const CATEGORIES = [
    { value: 'combustible', label: 'Combustible' },
    { value: 'peaje', label: 'Peaje' },
    { value: 'comida', label: 'Comida' },
    { value: 'mantenimiento', label: 'Mantenimiento' },
    { value: 'varios', label: 'Varios' },
  ] as const;

  it('lets the pills wrap instead of squeezing five of them into one row', async () => {
    await render(
      <SegmentedPills
        options={CATEGORIES}
        value="combustible"
        onChange={() => {}}
        wrap
        testID="categoria"
      />,
    );

    CATEGORIES.forEach((option) => {
      expect(screen.getByText(option.label)).toBeTruthy();
    });
    // Sin `flex: 1` cada pastilla mide lo que dice, que es lo que permite que
    // "Mantenimiento" no quede ilegible al lado de "Peaje".
    const style = StyleSheet.flatten(screen.getByTestId('categoria-peaje').props.style);
    expect(style.flex).toBeUndefined();
  });

  // `maxPerRow` es para grupos que no entran estirados en un renglon pero
  // tampoco quieren el borde irregular de `wrap`: las pastillas forman una
  // grilla pareja que baja de fila sola.
  it('caps how many pills share a row and lets the rest wrap', async () => {
    await render(
      <SegmentedPills
        options={CATEGORIES}
        value="combustible"
        onChange={() => {}}
        maxPerRow={3}
        testID="categoria"
      />,
    );

    const row = StyleSheet.flatten(screen.getByTestId('categoria-row').props.style);
    expect(row.flexWrap).toBe('wrap');

    // Base del 25% con tres por fila: tres entran (75% mas los dos huecos) y
    // una cuarta ya no, asi que baja sola. `flexGrow` las estira para llenar
    // el renglon, sin que el ancho dependa de cuanto mida el texto.
    const style = StyleSheet.flatten(screen.getByTestId('categoria-peaje').props.style);
    expect(style.flexBasis).toBe('25%');
    expect(style.flexGrow).toBe(1);
    expect(style.flex).toBeUndefined();
  });

  it('keeps two per row readable on a narrow screen', async () => {
    await render(
      <SegmentedPills
        options={CATEGORIES}
        value="combustible"
        onChange={() => {}}
        maxPerRow={2}
        testID="categoria"
      />,
    );

    const style = StyleSheet.flatten(screen.getByTestId('categoria-peaje').props.style);
    expect(style.flexBasis).toBe('33.333333333333336%');
  });

  it('still stretches its pills to fill a single row by default', async () => {
    await render(
      <SegmentedPills options={OPTIONS} value="efectivo" onChange={() => {}} testID="cobro" />,
    );

    const style = StyleSheet.flatten(screen.getByTestId('cobro-qr').props.style);
    expect(style.flex).toBe(1);
  });

  // D10 del plan de cambio de envase: cuando no hay nada que cobrar, el cobro
  // se bloquea. La pastilla gris es lo que hace VISIBLE ese bloqueo -- sin la
  // prop, la pantalla tendria que esconder el selector y el chofer no sabria
  // por que desaparecio.
  describe('disabled', () => {
    it('ignores a tap while it is blocked', async () => {
      const onChange = jest.fn();
      await render(
        <SegmentedPills
          options={OPTIONS}
          value="efectivo"
          onChange={onChange}
          disabled
          testID="cobro"
        />,
      );

      await fireEvent.press(screen.getByTestId('cobro-qr'));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('tells assistive tech that the whole row is blocked', async () => {
      await render(
        <SegmentedPills
          options={OPTIONS}
          value="efectivo"
          onChange={() => {}}
          disabled
          testID="cobro"
        />,
      );

      OPTIONS.forEach((option) => {
        expect(
          screen.getByTestId(`cobro-${option.value}`).props.accessibilityState.disabled,
        ).toBe(true);
      });
    });

    it('keeps working when it is not blocked', async () => {
      const onChange = jest.fn();
      await render(
        <SegmentedPills options={OPTIONS} value="efectivo" onChange={onChange} testID="cobro" />,
      );

      await fireEvent.press(screen.getByTestId('cobro-qr'));

      expect(onChange).toHaveBeenCalledWith('qr');
      expect(screen.getByTestId('cobro-qr').props.accessibilityState.disabled).toBe(false);
    });
  });
});
