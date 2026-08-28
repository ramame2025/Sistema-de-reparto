import { formatArs } from './currency';

describe('formatArs', () => {
  it('groups thousands with a dot, the way the mockups show prices', () => {
    expect(formatArs(8200)).toBe('$8.200');
    expect(formatArs(38000)).toBe('$38.000');
    expect(formatArs(197500)).toBe('$197.500');
  });

  it('renders amounts below a thousand without a separator', () => {
    expect(formatArs(0)).toBe('$0');
    expect(formatArs(940)).toBe('$940');
  });

  it('rounds to whole pesos', () => {
    expect(formatArs(8200.4)).toBe('$8.200');
    expect(formatArs(8200.6)).toBe('$8.201');
  });

  it('keeps the sign outside the peso symbol', () => {
    expect(formatArs(-1500)).toBe('-$1.500');
  });
});
