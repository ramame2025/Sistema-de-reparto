import type { Config } from 'jest';

/**
 * jsdom porque lo que se testea son helpers de UI y componentes de React.
 * `next/jest` no se usa a proposito: solo se testean modulos de `src/lib` y
 * componentes puros, sin el runtime de rutas de Next.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
};

export default config;
