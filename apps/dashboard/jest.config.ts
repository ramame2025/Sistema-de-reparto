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
  // `@distribuidor/shared` se publica como ESM ya compilado, que este runner
  // no sabe cargar. Se resuelve contra las fuentes TS, que si pasan por
  // ts-jest. Hasta ahora no hacia falta porque el dashboard solo importaba
  // tipos, que desaparecen al compilar.
  moduleNameMapper: {
    '^@distribuidor/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // Los imports internos del paquete llevan extension .js (ESM); apuntan
    // al .ts hermano.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

export default config;
