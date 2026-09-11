import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SyncHeader } from './SyncHeader';

describe('SyncHeader', () => {
  it('leads with what is still stuck on the phone', async () => {
    await render(<SyncHeader pendingCount={3} truckCode="C-04" lastSyncAt="09:38" />);

    expect(screen.getByTestId('sync-header-title').props.children).toBe('3 ventas en cola');
  });

  it('says one venta, not one ventas', async () => {
    await render(<SyncHeader pendingCount={1} />);

    expect(screen.getByTestId('sync-header-title').props.children).toBe('1 venta en cola');
  });

  it('says the queue is clean when nothing is waiting', async () => {
    await render(<SyncHeader pendingCount={0} />);

    expect(screen.getByTestId('sync-header-title').props.children).toBe('Todo sincronizado');
    expect(screen.getByTestId('sync-header-icon-clean')).toBeTruthy();
  });

  it('dates the last time the app reached the server', async () => {
    await render(<SyncHeader pendingCount={0} lastSyncAt="09:38" />);

    expect(screen.getByTestId('sync-header-last').props.children).toBe(
      'Última sincronización 09:38'
    );
  });

  it('admits it never synced rather than dating a sync that never happened', async () => {
    await render(<SyncHeader pendingCount={0} />);

    expect(screen.getByTestId('sync-header-last').props.children).toBe('Todavía no sincronizó');
  });

  it('names the truck when there is one', async () => {
    await render(<SyncHeader pendingCount={0} truckCode="C-04" />);

    expect(screen.getByTestId('sync-header-eyebrow').props.children).toBe('SINCRONIZACIÓN · C-04');
  });

  it('drops the separator when there is no truck for today', async () => {
    await render(<SyncHeader pendingCount={0} />);

    expect(screen.getByTestId('sync-header-eyebrow').props.children).toBe('SINCRONIZACIÓN');
  });
});
