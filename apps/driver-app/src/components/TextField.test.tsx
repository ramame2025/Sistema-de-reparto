import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TextField } from './TextField';

describe('TextField', () => {
  it('reports typed text through onChangeText', async () => {
    const onChangeText = jest.fn();
    await render(
      <TextField placeholder="Usuario" onChangeText={onChangeText} testID="field" />,
    );

    fireEvent.changeText(screen.getByTestId('field'), 'chofer1');
    expect(onChangeText).toHaveBeenCalledWith('chofer1');
  });

  it('forwards the ref to the underlying TextInput', async () => {
    const ref = React.createRef<import('react-native').TextInput>();
    await render(<TextField ref={ref} testID="field" />);

    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.focus).toBe('function');
  });
});
