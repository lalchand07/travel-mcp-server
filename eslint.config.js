import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'data'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', 'scripts/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['error', { allow: ['error'] }],
      // Typed cache getters (get<T>) are clearer than casting at every call site.
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['test/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
  prettier,
);
