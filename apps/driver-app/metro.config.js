// Metro para el monorepo pnpm. Sin esto, Metro no ve `packages/shared` ni
// resuelve `@distribuidor/shared` fuera de `apps/driver-app`.
// Ref: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Vigilar todo el monorepo: cambios en packages/shared disparan rebundle.
config.watchFolders = [monorepoRoot];

// 2. Resolver primero desde la app, después desde la raíz del workspace.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
