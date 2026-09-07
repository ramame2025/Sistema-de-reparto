import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SectionLabel } from './SectionLabel';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

describe('SectionLabel', () => {
  it('renders its text', async () => {
    await render(<SectionLabel>COBRADO HOY</SectionLabel>);
    expect(screen.getByText('COBRADO HOY')).toBeTruthy();
  });

  it('uses the muted eyebrow style by default', async () => {
    await render(<SectionLabel>CATEGORÍA</SectionLabel>);
    expect(screen.getByText('CATEGORÍA')).toHaveStyle({
      color: colors.textSecondary,
      fontSize: typography.sizes.xs,
    });
  });

  it('uses the primary field style when variant is field', async () => {
    await render(<SectionLabel variant="field">Productos</SectionLabel>);
    expect(screen.getByText('Productos')).toHaveStyle({
      color: colors.textPrimary,
      fontSize: typography.sizes.sm,
    });
  });
});
