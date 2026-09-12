import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TruckStockCard, type TruckStockCardLine } from './TruckStockCard';
import { colors } from '../theme/colors';

const line = (overrides: Partial<TruckStockCardLine> = {}): TruckStockCardLine => ({
  productCode: 'G10',
  label: 'G10',
  loaded: 30,
  remaining: 12,
  ...overrides,
});

const LINES: TruckStockCardLine[] = [
  line(),
  line({ productCode: 'G15', label: 'G15', loaded: 25, remaining: 9 }),
  line({ productCode: 'G45', label: 'G45', loaded: 6, remaining: 3 }),
  line({ productCode: 'G15_AUTO', label: 'G15 auto', loaded: 10, remaining: 5 }),
];

const flatStyleOf = (testID: string) => {
  const style = screen.getByTestId(testID).props.style;
  return Array.isArray(style) ? Object.assign({}, ...style.flat()) : style;
};

const widthOf = (testID: string) => flatStyleOf(testID).width;

const colorOf = (testID: string) => {
  const style = screen.getByTestId(testID).props.style;
  return (Array.isArray(style) ? Object.assign({}, ...style.flat()) : style).color;
};

describe('TruckStockCard', () => {
  describe('without a manifest for today', () => {
    it('says the numbers cannot be known yet, instead of showing a zero that reads as "sold out"', async () => {
      await render(
        <TruckStockCard
          lines={LINES.map((entry) => ({ ...entry, loaded: 0, remaining: 0 }))}
          manifestAt={null}
          onLoadManifest={jest.fn()}
          testID="stock"
        />,
      );

      expect(screen.getByTestId('stock-header-subtitle')).toHaveTextContent(
        'Sin remito no sabemos qué te queda',
      );
      expect(screen.queryByTestId('stock-remaining-total')).toBeNull();
    });

    it('shows a dash per product, never a number nobody recorded', async () => {
      await render(
        <TruckStockCard
          lines={LINES.map((entry) => ({ ...entry, loaded: 0, remaining: 0 }))}
          manifestAt={null}
          onLoadManifest={jest.fn()}
          testID="stock"
        />,
      );

      expect(screen.getByTestId('stock-tile-G10-value')).toHaveTextContent('—');
      expect(screen.getByTestId('stock-tile-G15_AUTO-value')).toHaveTextContent('—');
    });

    it('offers the one action that fixes it', async () => {
      const onLoadManifest = jest.fn();
      await render(
        <TruckStockCard
          lines={[]}
          manifestAt={null}
          onLoadManifest={onLoadManifest}
          testID="stock"
        />,
      );

      fireEvent.press(screen.getByTestId('stock-load-cta'));
      expect(onLoadManifest).toHaveBeenCalledTimes(1);
    });
  });

  describe('with a manifest loaded', () => {
    const renderLoaded = (lines: TruckStockCardLine[] = LINES, onPress = jest.fn()) =>
      render(
        <TruckStockCard
          lines={lines}
          manifestAt="2026-01-31T10:10:00.000Z"
          onLoadManifest={jest.fn()}
          onPress={onPress}
          testID="stock"
        />,
      );

    it('leads with what is left across the whole truck', async () => {
      await renderLoaded();

      expect(screen.getByTestId('stock-remaining-total')).toHaveTextContent('quedan 29');
    });

    it('backs that total with the manifest it came from', async () => {
      await renderLoaded();

      // La hora se formatea en la zona del telefono, asi que se afirma lo que
      // no depende de ella.
      expect(screen.getByTestId('stock-header-subtitle')).toHaveTextContent(/71 cargados$/);
    });

    it('shows remaining over loaded per product, not the other way round', async () => {
      await renderLoaded();

      expect(screen.getByTestId('stock-tile-G10-value')).toHaveTextContent('12');
      expect(screen.getByTestId('stock-tile-G10-loaded')).toHaveTextContent('/30');
    });

    it('draws a full bar while nothing has been sold yet', async () => {
      await renderLoaded([line({ loaded: 10, remaining: 10 })]);

      expect(widthOf('stock-tile-G10-bar-fill')).toBe('100%');
    });

    it('empties the bar as the day advances, instead of filling it', async () => {
      await renderLoaded([line({ loaded: 10, remaining: 2 })]);

      expect(widthOf('stock-tile-G10-bar-fill')).toBe('20%');
    });

    it('warns in amber once three or fewer are left', async () => {
      await renderLoaded([line({ loaded: 6, remaining: 3 })]);

      expect(colorOf('stock-tile-G10-value')).toBe(colors.warning);
    });

    it('stays calm at four, so the card does not cry wolf all day', async () => {
      await renderLoaded([line({ loaded: 6, remaining: 4 })]);

      expect(colorOf('stock-tile-G10-value')).toBe(colors.primary);
    });

    it('shows a negative remainder in red rather than hiding a real data problem', async () => {
      await renderLoaded([line({ loaded: 5, remaining: -3 })]);

      expect(screen.getByTestId('stock-tile-G10-value')).toHaveTextContent('-3');
      expect(colorOf('stock-tile-G10-value')).toBe(colors.error);
    });

    it('dashes a product that simply did not travel today', async () => {
      await renderLoaded([line({ loaded: 0, remaining: 0 })]);

      expect(screen.getByTestId('stock-tile-G10-value')).toHaveTextContent('—');
    });

    it('opens the manifest it is summarising when tapped', async () => {
      const onPress = jest.fn();
      await renderLoaded(LINES, onPress);

      fireEvent.press(screen.getByTestId('stock'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });
});
