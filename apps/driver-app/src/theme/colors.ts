export const colors = {
  primary: '#1E3A5F',
  primaryLight: '#2E5A8F',
  secondary: '#0F9B8E',
  background: '#F5F6F8',
  surface: '#FFFFFF',
  border: '#E1E4E8',
  textPrimary: '#1A1D21',
  textSecondary: '#6B7280',
  success: '#2E9E5B',
  warning: '#D89614',
  error: '#D93B3B',
} as const;

export type ColorToken = keyof typeof colors;
