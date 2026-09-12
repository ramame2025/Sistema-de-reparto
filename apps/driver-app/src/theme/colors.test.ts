import { colors, darkColors, lightColors } from './colors';
import { radii } from './radii';
import { spacing, MIN_TOUCH_TARGET } from './spacing';

describe('theme/colors', () => {
  it('exposes the confirmed placeholder tokens with exact hex values', () => {
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
    expect(colors.onPrimary).toBe('#FFFFFF');
  });

  it('defaults to the light palette', () => {
    expect(colors).toBe(lightColors);
  });

  it('exposes exactly the confirmed tokens, no more, no less', () => {
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
        'onPrimary',
      ].sort()
    );
  });

  it('gives the dark palette exactly the same tokens as the light one', () => {
    // Un token que existe en una paleta y no en la otra es una pantalla rota
    // en un solo tema, y es el tipo de bug que no se ve hasta la noche.
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it('keeps the bars branded in both themes, so what goes on them stays white', () => {
    expect(darkColors.primary).toBe(lightColors.primary);
    expect(darkColors.onPrimary).toBe(lightColors.onPrimary);
  });

  it('actually darkens the surfaces it is named after', () => {
    expect(darkColors.background).not.toBe(lightColors.background);
    expect(darkColors.surface).not.toBe(lightColors.surface);
    expect(darkColors.textPrimary).not.toBe(lightColors.textPrimary);
  });
});

describe('theme/spacing', () => {
  it('exposes the 4/8/16/24/32 spacing scale', () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 });
  });

  it('exposes MIN_TOUCH_TARGET as 48', () => {
    expect(MIN_TOUCH_TARGET).toBe(48);
  });
});

describe('theme/radii', () => {
  it('exposes the named border-radius scale', () => {
    expect(radii).toEqual({ sm: 8, md: 10, lg: 16, pill: 999 });
  });
});
