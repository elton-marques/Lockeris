import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/web/public/sw.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { document: 'readonly', window: 'readonly', navigator: 'readonly', fetch: 'readonly', FormData: 'readonly', File: 'readonly', URL: 'readonly', location: 'readonly', caches: 'readonly', self: 'readonly', indexedDB: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', crypto: 'readonly', localStorage: 'readonly', alert: 'readonly' } } }
);
