import { formatDistance } from './distance';

describe('formatDistance', () => {
  it('reads short distances in metres, rounded to ten', () => {
    expect(formatDistance(0.04)).toBe('a 40 m');
    expect(formatDistance(0.124)).toBe('a 120 m');
    expect(formatDistance(0.31)).toBe('a 310 m');
  });

  it('switches to kilometres with one decimal from a kilometre up', () => {
    expect(formatDistance(1.2)).toBe('a 1,2 km');
    expect(formatDistance(12.34)).toBe('a 12,3 km');
  });

  it('uses a comma as the decimal separator, as Argentina writes it', () => {
    expect(formatDistance(2.5)).toContain(',');
    expect(formatDistance(2.5)).not.toContain('.');
  });
});
