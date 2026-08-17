import { colors } from './colors';
import { spacing, MIN_TOUCH_TARGET } from './spacing';

describe('theme/colors', () => {
  it('exposes the 11 confirmed placeholder tokens with exact hex values', () => {
    expect(colors.primary).toBe('#1E3A5F');
    expect(colors.primaryLight).toBe('#2E5A8F');
    expect(colors.secondary).toBe('#0F9B8E');
    expect(colors.background).toBe('#F5F6F8');
    expect(colors.surface).toBe('#FFFFFF');
    expect(colors.border).toBe('#E1E4E8');
    expect(colors.textPrimary).toBe('#1A1D21');
    expect(colors.textSecondary).toBe('#6B7280');
    expect(colors.success).toBe('#2E9E5B');
    expect(colors.warning).toBe('#D89614');
    expect(colors.error).toBe('#D93B3B');
  });

  it('exposes exactly the 11 confirmed tokens, no more, no less', () => {
    expect(Object.keys(colors).sort()).toEqual(
      [
        'primary',
        'primaryLight',
        'secondary',
        'background',
        'surface',
        'border',
        'textPrimary',
        'textSecondary',
        'success',
        'warning',
        'error',
      ].sort()
    );
  });
});

describe('theme/spacing', () => {
  it('exposes the 4/8/16/24 spacing scale', () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 16, lg: 24 });
  });

  it('exposes MIN_TOUCH_TARGET as 48', () => {
    expect(MIN_TOUCH_TARGET).toBe(48);
  });
});
