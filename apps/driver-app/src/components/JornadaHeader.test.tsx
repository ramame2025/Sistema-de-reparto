import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { JornadaHeader } from './JornadaHeader';

describe('JornadaHeader', () => {
  it('names the day, the driver and the truck', async () => {
    await render(
      <JornadaHeader
        jornada="JUEVES 27/08"
        driverName="chofer1"
        truckCode="C-04"
        truckPlate="AB123CD"
        truckCapacity={120}
      />,
    );

    expect(screen.getByText('JORNADA · JUEVES 27/08')).toBeTruthy();
    expect(screen.getByText('chofer1 · C-04')).toBeTruthy();
    expect(screen.getByText('AB123CD · 120 u. de capacidad')).toBeTruthy();
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
        truckCapacity={120}
        truckKind="cobertura"
      />,
    );

    expect(screen.getByText('AB123CD · 120 u. de capacidad · cobertura')).toBeTruthy();
  });

  it('says nothing extra for the usual truck', async () => {
    await render(
      <JornadaHeader
        jornada="JUEVES 27/08"
        driverName="chofer1"
        truckCode="C-04"
        truckPlate="AB123CD"
        truckCapacity={120}
        truckKind="titular"
      />,
    );

    expect(screen.getByText('AB123CD · 120 u. de capacidad')).toBeTruthy();
  });
});
