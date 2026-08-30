import { DEV_JWT_SECRET_FALLBACK, resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret', () => {
  describe('in production (NODE_ENV=production)', () => {
    it('throws when JWT_SECRET is unset', () => {
      expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(
        /JWT_SECRET/,
      );
    });

    it('throws when JWT_SECRET is empty or whitespace', () => {
      expect(() =>
        resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: '   ' }),
      ).toThrow(/JWT_SECRET/);
    });

    it('throws when JWT_SECRET is still the public dev fallback', () => {
      expect(() =>
        resolveJwtSecret({
          NODE_ENV: 'production',
          JWT_SECRET: DEV_JWT_SECRET_FALLBACK,
        }),
      ).toThrow(/JWT_SECRET/);
    });

    it('returns the secret when it is a real, unique value', () => {
      expect(
        resolveJwtSecret({
          NODE_ENV: 'production',
          JWT_SECRET: 's3cr3t-unique-value',
        }),
      ).toBe('s3cr3t-unique-value');
    });

    it('trims surrounding whitespace from a valid secret', () => {
      expect(
        resolveJwtSecret({
          NODE_ENV: 'production',
          JWT_SECRET: '  s3cr3t-unique-value  ',
        }),
      ).toBe('s3cr3t-unique-value');
    });
  });

  describe('outside production', () => {
    it('falls back to the dev secret when JWT_SECRET is unset', () => {
      expect(resolveJwtSecret({})).toBe(DEV_JWT_SECRET_FALLBACK);
    });

    it('honours a custom JWT_SECRET when provided', () => {
      expect(resolveJwtSecret({ JWT_SECRET: 'local-custom' })).toBe(
        'local-custom',
      );
    });
  });
});
