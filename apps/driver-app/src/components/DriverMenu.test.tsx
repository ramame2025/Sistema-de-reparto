jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { darkColors } from '../theme/colors';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DriverMenu } from './DriverMenu';

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  driverName: 'chofer1',
  truckCode: 'C-04',
  truckPlate: 'AB123CD',
  onPressManifest: jest.fn(),
  onPressPriceList: jest.fn(),
  onPressLogout: jest.fn(),
};

describe('DriverMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('says who is driving and in which truck', async () => {
    await render(<DriverMenu {...baseProps} />);

    expect(screen.getByText('chofer1')).toBeTruthy();
    expect(screen.getByTestId('driver-menu-truck').props.children).toBe('Camión C-04 · AB123CD');
  });

  it('says plainly when there is no truck for today', async () => {
    await render(<DriverMenu {...baseProps} truckCode={undefined} truckPlate={undefined} />);

    expect(screen.getByTestId('driver-menu-truck').props.children).toBe(
      'Sin camión asignado para hoy'
    );
  });

  it('opens the load manifest', async () => {
    await render(<DriverMenu {...baseProps} />);

    await fireEvent.press(screen.getByTestId('driver-menu-manifest'));

    expect(baseProps.onPressManifest).toHaveBeenCalledTimes(1);
  });

  it('opens the price list', async () => {
    await render(<DriverMenu {...baseProps} />);

    await fireEvent.press(screen.getByTestId('driver-menu-prices'));

    expect(baseProps.onPressPriceList).toHaveBeenCalledTimes(1);
  });

  it('dates the price list the app is actually holding', async () => {
    await render(<DriverMenu {...baseProps} priceListUpdatedAt="07:05" />);

    expect(screen.getByText('Actualizada 07:05')).toBeTruthy();
  });

  it('admits it has no price list rather than dating one it never got', async () => {
    await render(<DriverMenu {...baseProps} />);

    expect(screen.getByText('Sin datos')).toBeTruthy();
  });

  it('closes on the X', async () => {
    await render(<DriverMenu {...baseProps} />);

    await fireEvent.press(screen.getByTestId('driver-menu-close'));

    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('logs out from the foot of the menu, where it no longer hides at the end of a scroll', async () => {
    await render(<DriverMenu {...baseProps} />);

    await fireEvent.press(screen.getByTestId('driver-menu-logout'));

    expect(baseProps.onPressLogout).toHaveBeenCalledTimes(1);
  });

  it('offers both themes and marks the one in use', async () => {
    await render(
      <ThemeProvider>
        <DriverMenu {...baseProps} />
      </ThemeProvider>
    );

    expect(screen.getByTestId('driver-menu-theme-light').props.accessibilityState.selected).toBe(
      true
    );
    expect(screen.getByTestId('driver-menu-theme-dark').props.accessibilityState.selected).toBe(
      false
    );
  });

  it('switches the app to the dark palette from the menu', async () => {
    await render(
      <ThemeProvider>
        <DriverMenu {...baseProps} />
      </ThemeProvider>
    );

    await fireEvent.press(screen.getByTestId('driver-menu-theme-dark'));

    await waitFor(() =>
      expect(screen.getByTestId('driver-menu-theme-dark').props.accessibilityState.selected).toBe(
        true
      )
    );

    const panel = StyleSheet.flatten(screen.getByTestId('driver-menu-panel').props.style);
    expect(panel.backgroundColor).toBe(darkColors.surface);
  });

  it('carries no Ayuda row, because nothing was ever behind it', async () => {
    await render(<DriverMenu {...baseProps} />);

    expect(screen.queryByTestId('driver-menu-help')).toBeNull();
  });

  it('renders nothing while it is closed', async () => {
    await render(<DriverMenu {...baseProps} visible={false} />);

    expect(screen.queryByTestId('driver-menu-logout')).toBeNull();
  });

  it('names the installed version and when the app last reached the server', async () => {
    await render(<DriverMenu {...baseProps} appVersion="1.4.2" lastSyncAt="9:38" />);

    expect(screen.getByTestId('driver-menu-footnote').props.children).toBe(
      'Versión 1.4.2 · sincronizado 9:38'
    );
  });

  it('shows the half it knows rather than inventing the other', async () => {
    await render(<DriverMenu {...baseProps} appVersion="1.4.2" />);

    expect(screen.getByTestId('driver-menu-footnote').props.children).toBe('Versión 1.4.2');
  });

  it('drops the support line entirely when it knows neither', async () => {
    await render(<DriverMenu {...baseProps} />);

    expect(screen.queryByTestId('driver-menu-footnote')).toBeNull();
  });

  describe('panel lateral', () => {
    it('leaves the day behind it visible instead of taking the whole screen', async () => {
      await render(<DriverMenu {...baseProps} />);

      const panel = StyleSheet.flatten(screen.getByTestId('driver-menu-panel').props.style);

      expect(panel.width).toBe('70%');
    });

    it('closes when the driver taps outside it', async () => {
      // Con una sola mano, acertarle a la zona de afuera es mucho mas facil
      // que apuntar a la X de la esquina.
      await render(<DriverMenu {...baseProps} />);

      await fireEvent.press(screen.getByTestId('driver-menu-backdrop'));

      expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not mount the panel until it is opened', async () => {
      await render(<DriverMenu {...baseProps} visible={false} />);

      expect(screen.queryByTestId('driver-menu-panel')).toBeNull();
    });

    it('stays mounted while it slides out, then goes away on its own', async () => {
      // El riesgo del panel animado: si el desmontaje no ocurriera, el menu
      // quedaria tapando la pantalla para siempre con el Modal invisible.
      const { rerender } = await render(<DriverMenu {...baseProps} />);
      expect(screen.getByTestId('driver-menu-panel')).toBeTruthy();

      await act(async () => {
        rerender(<DriverMenu {...baseProps} visible={false} />);
      });

      await waitFor(() => expect(screen.queryByTestId('driver-menu-panel')).toBeNull());
    });
  });

  describe('remito de carga', () => {
    it('says at a glance whether today is already loaded', async () => {
      await render(<DriverMenu {...baseProps} manifestLoadedAt="07:10" />);

      expect(screen.getByText('Cargado 07:10')).toBeTruthy();
    });

    it('says the day is still unloaded rather than staying silent about it', async () => {
      await render(<DriverMenu {...baseProps} />);

      expect(screen.getByText('Sin cargar hoy')).toBeTruthy();
    });

    it('stays pressable once loaded, because a midday reload is normal', async () => {
      // El stock del dia SUMA los remitos: bloquear el segundo romperia al
      // chofer que vuelve al deposito a recargar.
      await render(<DriverMenu {...baseProps} manifestLoadedAt="07:10" />);

      await fireEvent.press(screen.getByTestId('driver-menu-manifest'));

      expect(baseProps.onPressManifest).toHaveBeenCalledTimes(1);
    });
  });
});
