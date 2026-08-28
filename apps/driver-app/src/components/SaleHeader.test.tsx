import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SaleHeader } from './SaleHeader';

describe('SaleHeader', () => {
  it('shows the sale number and the assigned truck code', async () => {
    await render(<SaleHeader saleNumber={13} truckCode="C-04" queuedCount={0} />);
    expect(screen.getByText('VENTA 13 · C-04')).toBeTruthy();
  });

  it('omits the truck segment when no truck is assigned today', async () => {
    await render(<SaleHeader saleNumber={1} queuedCount={0} />);
    expect(screen.getByText('VENTA 1')).toBeTruthy();
  });

  it('shows the queued-sales counter when the offline queue is not empty', async () => {
    await render(<SaleHeader saleNumber={13} truckCode="C-04" queuedCount={2} />);
    expect(screen.getByTestId('sale-header-queued')).toBeTruthy();
    expect(screen.getByText('2 EN COLA')).toBeTruthy();
  });

  it('hides the queued-sales counter when nothing is pending', async () => {
    await render(<SaleHeader saleNumber={13} truckCode="C-04" queuedCount={0} />);
    expect(screen.queryByTestId('sale-header-queued')).toBeNull();
  });
});
