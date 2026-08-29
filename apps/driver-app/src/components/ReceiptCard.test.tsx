import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ReceiptCard } from './ReceiptCard';

describe('ReceiptCard', () => {
  it('confirms an attached receipt and offers to take it back off', async () => {
    const onRemove = jest.fn();
    await render(
      <ReceiptCard
        receiptRef="https://cdn.test/ticket.jpg"
        uploading={false}
        onCapture={() => {}}
        onPickFromGallery={() => {}}
        onRemove={onRemove}
        testID="comprobante"
      />,
    );

    expect(screen.getByText('Ticket adjunto')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('comprobante-remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to remove when no receipt was attached yet', async () => {
    await render(
      <ReceiptCard
        receiptRef=""
        uploading={false}
        onCapture={() => {}}
        onPickFromGallery={() => {}}
        onRemove={() => {}}
        testID="comprobante"
      />,
    );

    expect(screen.queryByTestId('comprobante-remove')).toBeNull();
  });

  it('offers both ways of getting the photo in', async () => {
    const onCapture = jest.fn();
    const onPickFromGallery = jest.fn();
    await render(
      <ReceiptCard
        receiptRef=""
        uploading={false}
        onCapture={onCapture}
        onPickFromGallery={onPickFromGallery}
        onRemove={() => {}}
        testID="comprobante"
      />,
    );

    await fireEvent.press(screen.getByTestId('comprobante-capture'));
    await fireEvent.press(screen.getByTestId('comprobante-gallery'));

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onPickFromGallery).toHaveBeenCalledTimes(1);
  });

  it('blocks both buttons while a photo is still going up', async () => {
    const onCapture = jest.fn();
    await render(
      <ReceiptCard
        receiptRef=""
        uploading
        onCapture={onCapture}
        onPickFromGallery={() => {}}
        onRemove={() => {}}
        testID="comprobante"
      />,
    );

    await fireEvent.press(screen.getByTestId('comprobante-capture'));
    expect(onCapture).not.toHaveBeenCalled();
  });
});
