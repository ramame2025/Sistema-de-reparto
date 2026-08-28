jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockedNavigate = jest.fn();
const mockedParentNavigate = jest.fn();
let mockedParams: Record<string, unknown>;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockedNavigate,
    getParent: () => ({ navigate: mockedParentNavigate }),
  }),
  useRoute: () => ({ params: mockedParams }),
}));

jest.mock('../context/SyncContext', () => {
  const actual = jest.requireActual('../context/SyncContext');
  return { ...actual, useSync: jest.fn() };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SaleResultScreen } from './SaleResultScreen';
import { useSync } from '../context/SyncContext';

const mockedUseSync = useSync as jest.Mock;

const sentParams = {
  outcome: 'sent' as const,
  customerName: 'Kiosco La Esquina',
  total: 13000,
  paymentMethod: 'efectivo' as const,
};

const queuedParams = {
  outcome: 'queued' as const,
  customerName: 'Kiosco La Esquina',
  total: 13000,
  paymentMethod: 'efectivo' as const,
};

beforeEach(() => {
  mockedNavigate.mockClear();
  mockedParentNavigate.mockClear();
  mockedParams = sentParams;
  mockedUseSync.mockReturnValue({
    daySummary: { activeCount: 13, canceledCount: 0, activeTotal: 197500 },
    pendingSales: [],
  });
});

describe('SaleResultScreen/sent', () => {
  it('confirms the sale reached the server, naming customer, amount and payment', async () => {
    await render(<SaleResultScreen />);

    expect(screen.getByText('Venta enviada')).toBeTruthy();
    expect(screen.getByTestId('sale-result-summary')).toHaveTextContent(
      'Kiosco La Esquina · $13.000 · Efectivo',
    );
  });

  it('recaps the day so far', async () => {
    await render(<SaleResultScreen />);

    expect(screen.getByTestId('sale-result-day')).toHaveTextContent('13 ventas · $197.500');
  });

  it('mentions the pending queue only when something is actually waiting', async () => {
    await render(<SaleResultScreen />);
    expect(screen.getByTestId('sale-result-day')).not.toHaveTextContent(/en cola/);

    mockedUseSync.mockReturnValue({
      daySummary: { activeCount: 13, canceledCount: 0, activeTotal: 197500 },
      pendingSales: [{ queueId: 'q1' }, { queueId: 'q2' }],
    });
    await render(<SaleResultScreen />);
    expect(screen.getByTestId('sale-result-day')).toHaveTextContent(
      '13 ventas · $197.500 · 2 en cola',
    );
  });

  it('offers a way into the history, where the sale can be edited or cancelled', async () => {
    await render(<SaleResultScreen />);

    await fireEvent.press(screen.getByTestId('sale-result-edit-link'));

    expect(mockedParentNavigate).toHaveBeenCalledWith('Inicio', { screen: 'SalesHistory' });
  });

  it('does not offer the sync queue link on a sale that already went through', async () => {
    await render(<SaleResultScreen />);

    expect(screen.queryByTestId('sale-result-queue-link')).toBeNull();
  });
});

describe('SaleResultScreen/queued', () => {
  it('says plainly that the sale is on the phone and must not be loaded again', async () => {
    mockedParams = queuedParams;
    mockedUseSync.mockReturnValue({
      daySummary: { activeCount: 13, canceledCount: 0, activeTotal: 197500 },
      pendingSales: [{ queueId: 'q1' }, { queueId: 'q2' }, { queueId: 'q3' }],
    });

    await render(<SaleResultScreen />);

    expect(screen.getByText('Guardada en el teléfono')).toBeTruthy();
    // Regex a proposito: toHaveTextContent con un string compara exacto en
    // este setup, asi que un substring pasaria por casualidad, no por match.
    expect(screen.getByTestId('sale-result-queued-hint')).toHaveTextContent(
      /no la cargues de nuevo/,
    );
  });

  it('counts what is waiting instead of the day summary', async () => {
    mockedParams = queuedParams;
    mockedUseSync.mockReturnValue({
      daySummary: { activeCount: 13, canceledCount: 0, activeTotal: 197500 },
      pendingSales: [{ queueId: 'q1' }, { queueId: 'q2' }, { queueId: 'q3' }],
    });

    await render(<SaleResultScreen />);

    expect(screen.getByTestId('sale-result-queue')).toHaveTextContent(/3 ventas esperando/);
  });

  it('leads to the sync queue rather than to editing something the server never saw', async () => {
    mockedParams = queuedParams;

    await render(<SaleResultScreen />);

    await fireEvent.press(screen.getByTestId('sale-result-queue-link'));
    expect(mockedParentNavigate).toHaveBeenCalledWith('Sincronización');
    expect(screen.queryByTestId('sale-result-edit-link')).toBeNull();
  });
});

describe('SaleResultScreen/next sale', () => {
  it('goes back to a clean sale form', async () => {
    await render(<SaleResultScreen />);

    await fireEvent.press(screen.getByTestId('sale-result-new-sale'));

    expect(mockedNavigate).toHaveBeenCalledWith('Sale');
  });
});
