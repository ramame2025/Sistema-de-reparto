import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { DayStatusCard } from './DayStatusCard';
import type { SaleProblem } from '../services/dayProblems';

const notSent: SaleProblem = {
  kind: 'not-sent',
  id: 'q1',
  customerName: 'Kiosco La Esquina',
  total: 23000,
  attempts: 3,
};

const missingProof: SaleProblem = {
  kind: 'missing-proof',
  id: 's1',
  customerName: 'Distribuidora Sur',
  total: 96000,
  paymentMethod: 'transferencia',
};

describe('DayStatusCard/todo en orden', () => {
  it('reports a clean day with what backs the claim', async () => {
    await render(
      <DayStatusCard problems={[]} sentCount={13} onPressProblem={() => {}} onResolve={() => {}} />,
    );

    expect(screen.getByText('Todo en orden')).toBeTruthy();
    expect(screen.getByTestId('day-status-detail')).toHaveTextContent(
      '13 ventas enviadas · nada en cola',
    );
  });

  it('offers no resolve action when there is nothing to resolve', async () => {
    await render(
      <DayStatusCard problems={[]} sentCount={13} onPressProblem={() => {}} onResolve={() => {}} />,
    );

    expect(screen.queryByTestId('day-status-resolve')).toBeNull();
  });
});

describe('DayStatusCard/con problemas', () => {
  it('counts the problems and says when they have to be sorted out', async () => {
    await render(
      <DayStatusCard
        problems={[notSent, missingProof]}
        sentCount={12}
        onPressProblem={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('2 ventas con problema')).toBeTruthy();
    expect(screen.getByText('Resolvelas antes de cerrar el día')).toBeTruthy();
  });

  it('speaks in singular for a single problem', async () => {
    await render(
      <DayStatusCard
        problems={[notSent]}
        sentCount={12}
        onPressProblem={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('1 venta con problema')).toBeTruthy();
  });

  it('explains an unsent sale by its attempts', async () => {
    await render(
      <DayStatusCard
        problems={[notSent]}
        sentCount={12}
        onPressProblem={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('Kiosco La Esquina · $23.000')).toBeTruthy();
    expect(screen.getByTestId('day-status-problem-q1-reason')).toHaveTextContent(
      'No se pudo enviar · 3 intentos',
    );
  });

  it('explains a missing proof by the payment method it belongs to', async () => {
    await render(
      <DayStatusCard
        problems={[missingProof]}
        sentCount={12}
        onPressProblem={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByTestId('day-status-problem-s1-reason')).toHaveTextContent(
      'Falta el comprobante de la transferencia',
    );
  });

  it('shows the customer alone when the sale could not be valued', async () => {
    const unpriced: SaleProblem = { kind: 'not-sent', id: 'q9', customerName: 'Marta', attempts: 1 };

    await render(
      <DayStatusCard
        problems={[unpriced]}
        sentCount={0}
        onPressProblem={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('Marta')).toBeTruthy();
  });

  it('opens the problem that was tapped', async () => {
    const onPressProblem = jest.fn();
    await render(
      <DayStatusCard
        problems={[notSent, missingProof]}
        sentCount={12}
        onPressProblem={onPressProblem}
        onResolve={() => {}}
      />,
    );

    await fireEvent.press(screen.getByTestId('day-status-problem-s1'));

    expect(onPressProblem).toHaveBeenCalledWith(missingProof);
  });

  it('offers a single way into resolving them all', async () => {
    const onResolve = jest.fn();
    await render(
      <DayStatusCard
        problems={[notSent, missingProof]}
        sentCount={12}
        onPressProblem={() => {}}
        onResolve={onResolve}
      />,
    );

    await fireEvent.press(screen.getByTestId('day-status-resolve'));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
