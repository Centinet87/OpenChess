import baseConfig, { asyncRules } from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...asyncRules,
  {
    ignores: ['**/out-tsc'],
  },
];
