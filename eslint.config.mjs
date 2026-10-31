import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import reactX from 'eslint-plugin-react-x';
import globals from 'globals';

// Use Next's plugin directly: the preset's legacy plugins still exclude ESLint 10.
export default defineConfig([
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    extends: [js.configs.recommended, nextPlugin.configs['core-web-vitals'], reactHooks.configs.flat.recommended],
    plugins: { 'react-x': reactX },
    rules: {
      'react-x/no-missing-key': 'error',
      'react-x/no-duplicate-key': 'error',
    },
  },
  { files: ['src/**/*.test.{js,jsx}', 'jest.*'], languageOptions: { globals: globals.jest } },
  globalIgnores(['.next/**', 'build/**', 'coverage/**', 'playwright-report/**', 'test-results/**']),
]);
