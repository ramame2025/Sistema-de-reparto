import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { ScreenScrollContext, useKeyboardAwareField } from './KeyboardAwareField';

const scrollResponderScrollNativeHandleToKeyboard = jest.fn();

function Field({ offset }: { offset?: number }) {
  const field = useKeyboardAwareField(offset);
  return <TextInput ref={field.ref} onFocus={field.onFocus} testID="campo" />;
}

const renderInScreen = async (scroll: unknown) =>
  render(
    <ScreenScrollContext.Provider value={{ current: scroll } as never}>
      <Field />
    </ScreenScrollContext.Provider>,
  );

beforeEach(() => {
  scrollResponderScrollNativeHandleToKeyboard.mockClear();
});

describe('useKeyboardAwareField', () => {
  it('asks the scroll view to lift the field above the keyboard when it gets focus', async () => {
    await renderInScreen({ scrollResponderScrollNativeHandleToKeyboard });

    await fireEvent(screen.getByTestId('campo'), 'focus');

    expect(scrollResponderScrollNativeHandleToKeyboard).toHaveBeenCalledTimes(1);
  });

  it('passes the field itself, so React Native measures the real node', async () => {
    await renderInScreen({ scrollResponderScrollNativeHandleToKeyboard });

    await fireEvent(screen.getByTestId('campo'), 'focus');

    const [node] = scrollResponderScrollNativeHandleToKeyboard.mock.calls[0];
    expect(node).toBeTruthy();
  });

  it('leaves breathing room between the field and the keyboard', async () => {
    await renderInScreen({ scrollResponderScrollNativeHandleToKeyboard });

    await fireEvent(screen.getByTestId('campo'), 'focus');

    const [, offset] = scrollResponderScrollNativeHandleToKeyboard.mock.calls[0];
    expect(offset).toBeGreaterThan(0);
  });

  it('refuses to pull the content down, which would open a gap above', async () => {
    await renderInScreen({ scrollResponderScrollNativeHandleToKeyboard });

    await fireEvent(screen.getByTestId('campo'), 'focus');

    const [, , preventNegative] = scrollResponderScrollNativeHandleToKeyboard.mock.calls[0];
    expect(preventNegative).toBe(true);
  });

  it('does nothing outside a ScreenContainer instead of crashing', async () => {
    await render(<Field />);

    await expect(fireEvent(screen.getByTestId('campo'), 'focus')).resolves.not.toThrow();
    expect(scrollResponderScrollNativeHandleToKeyboard).not.toHaveBeenCalled();
  });

  it('does nothing when the screen has no scroll view mounted yet', async () => {
    await renderInScreen(null);

    await expect(fireEvent(screen.getByTestId('campo'), 'focus')).resolves.not.toThrow();
    expect(scrollResponderScrollNativeHandleToKeyboard).not.toHaveBeenCalled();
  });
});
