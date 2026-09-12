import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { JornadaHeader } from './JornadaHeader';

describe('JornadaHeader', () => {
  it('names the day, the driver and the truck', async () => {
    await render(
      <JornadaHeader
        jornada="JUEVES 27/08"
        driverName="chofer1"
        truckCode="C-04"
        truckPlate="AB123CD"
      />,
    );

    expect(screen.getByText('JORNADA · JUEVES 27/08')).toBeTruthy();
    expect(screen.getByText('chofer1 · C-04')).toBeTruthy();
    expect(screen.getByText('AB123CD')).toBeTruthy();
  });

  // La capacidad dejo de ser un total y paso a ser una grilla por producto,
  // que no entra en una barra de identidad de una linea. Un total derivado
  // seria justo la mentira que se saco. Vive en el remito, que es donde el
  // chofer la usa.
  it('says nothing about capacity: it is per product now, and lives in the remito', async () => {
    await render(
      <JornadaHeader
        jornada="JUEVES 27/08"
        driverName="chofer1"
        truckCode="C-04"
        truckPlate="AB123CD"
      />,
    );

    expect(screen.queryByText(/capacidad/i)).toBeNull();
  });

  it('says plainly that there is no truck instead of leaving a gap', async () => {
    await render(<JornadaHeader jornada="JUEVES 27/08" driverName="chofer1" />);

    expect(screen.getByText('chofer1')).toBeTruthy();
    expect(screen.getByTestId('jornada-header-no-truck')).toBeTruthy();
  });

  it('flags a cobertura truck, so the driver notices it is not his usual one', async () => {
    await render(
      <JornadaHeader
        jornada="JUEVES 27/08"
        driverName="chofer1"
        truckCode="C-04"
        truckPlate="AB123CD"
        truckKind="cobertura"
      />,
    );

    expect(screen.getByText('AB123CD · cobertura')).toBeTruthy();
  });

  it('says nothing extra for the usual truck', async () => {
    await render(
      <JornadaHeader
        jornada="JUEVES 27/08"
        driverName="chofer1"
        truckCode="C-04"
        truckPlate="AB123CD"
        truckKind="titular"
      />,
    );

    expect(screen.getByText('AB123CD')).toBeTruthy();
  });

  describe('menu button', () => {
    it('opens the menu from the bar', async () => {
      const onPressMenu = jest.fn();
      await render(
        <JornadaHeader jornada="JUEVES 28/08" driverName="chofer1" onPressMenu={onPressMenu} />
      );

      await fireEvent.press(screen.getByTestId('jornada-header-menu'));

      expect(onPressMenu).toHaveBeenCalledTimes(1);
    });

    it('shows no button on a bar that has no menu behind it', async () => {
      await render(<JornadaHeader jornada="JUEVES 28/08" driverName="chofer1" />);

      expect(screen.queryByTestId('jornada-header-menu')).toBeNull();
    });
  });
});
