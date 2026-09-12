import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { CardHeader } from './CardHeader';
import { typography } from '../theme/typography';

const flatStyleOf = (testID: string) => {
  const style = screen.getByTestId(testID).props.style;
  return Array.isArray(style) ? Object.assign({}, ...style.flat()) : style;
};

describe('CardHeader', () => {
  it('names the card', async () => {
    await render(<CardHeader title="En el camión" testID="header" />);

    expect(screen.getByTestId('header-title')).toHaveTextContent('En el camión');
  });

  it('gives every card the same title size, so no card outranks another', async () => {
    await render(<CardHeader title="Cobrado hoy" testID="header" />);

    expect(flatStyleOf('header-title').fontSize).toBe(typography.sizes.lg);
    expect(flatStyleOf('header-title').fontWeight).toBe(typography.weights.bold);
  });

  it('carries a line of context under the title when there is one', async () => {
    await render(<CardHeader title="En el camión" subtitle="Remito 07:10" testID="header" />);

    expect(screen.getByTestId('header-subtitle')).toHaveTextContent('Remito 07:10');
  });

  it('renders no subtitle row at all when the card has nothing to add', async () => {
    await render(<CardHeader title="En el camión" testID="header" />);

    expect(screen.queryByTestId('header-subtitle')).toBeNull();
  });

  it('lets the card put its own headline number or action on the right', async () => {
    await render(
      <CardHeader
        title="En el camión"
        trailing={<Text testID="trailing">quedan 29</Text>}
        testID="header"
      />,
    );

    expect(screen.getByTestId('trailing')).toHaveTextContent('quedan 29');
  });
});
