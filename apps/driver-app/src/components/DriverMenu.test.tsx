import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

  it('marks the dark theme as not built yet instead of offering a switch that does nothing', async () => {
    await render(<DriverMenu {...baseProps} />);

    expect(screen.getByText('Oscuro')).toBeTruthy();
    expect(String(screen.getByTestId('driver-menu-theme-hint').props.children)).toContain(
      'Próximamente'
    );
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
});
