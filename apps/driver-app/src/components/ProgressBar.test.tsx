import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ProgressBar } from './ProgressBar';
import { colors } from '../theme/colors';

const flatStyleOf = (testID: string) => {
  const style = screen.getByTestId(testID).props.style;
  return Array.isArray(style) ? Object.assign({}, ...style) : style;
};

const widthOf = (testID: string) => {
  const style = screen.getByTestId(testID).props.style;
  return Array.isArray(style) ? Object.assign({}, ...style).width : style.width;
};

describe('ProgressBar', () => {
  it('fills in proportion to the ratio', async () => {
    await render(<ProgressBar current={7} total={7} testID="clientes" />);
    expect(widthOf('clientes-fill')).toBe('100%');
  });

  it('fills partially mid-way through', async () => {
    await render(<ProgressBar current={4} total={8} testID="clientes" />);
    expect(widthOf('clientes-fill')).toBe('50%');
  });

  it('stays empty rather than dividing by zero when nothing is assigned', async () => {
    await render(<ProgressBar current={0} total={0} testID="clientes" />);
    expect(widthOf('clientes-fill')).toBe('0%');
  });

  it('never overflows past full', async () => {
    await render(<ProgressBar current={9} total={7} testID="clientes" />);
    expect(widthOf('clientes-fill')).toBe('100%');
  });
  it('fills in success green by default, so every existing bar keeps its colour', async () => {
    await render(<ProgressBar current={1} total={2} testID="clientes" />);
    expect(flatStyleOf('clientes-fill').backgroundColor).toBe(colors.success);
  });

  it('takes the tone it is given, for bars that mean something other than progress', async () => {
    await render(<ProgressBar current={1} total={2} tone="warning" testID="stock" />);
    expect(flatStyleOf('stock-fill').backgroundColor).toBe(colors.warning);
  });
});
