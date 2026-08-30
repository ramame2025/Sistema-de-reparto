/**
 * Public, well-known development fallback. Fine for local work; catastrophic in
 * production, where it would let anyone mint a valid admin token.
 */
export const DEV_JWT_SECRET_FALLBACK = 'dev_secret_change_me';

/**
 * Resolves the JWT signing secret for the current environment.
 *
 * In production a strong, unique `JWT_SECRET` is mandatory — a missing, empty,
 * or still-default value throws at startup so a misconfigured deploy fails loud
 * instead of silently trusting forgeable tokens. Outside production the dev
 * fallback keeps local setup frictionless.
 */
export function resolveJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = env.JWT_SECRET?.trim();
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction) {
    if (!secret || secret === DEV_JWT_SECRET_FALLBACK) {
      throw new Error(
        'JWT_SECRET must be set to a strong, unique value in production',
      );
    }
    return secret;
  }

  return secret && secret.length > 0 ? secret : DEV_JWT_SECRET_FALLBACK;
}
