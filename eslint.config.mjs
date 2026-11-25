import js from '@eslint/js';
import parser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
    { ignores: ['out/**', 'dist/**', 'node_modules/**', '.vscode-test/**'] },
    js.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['**/*.ts'],
        languageOptions: { parser },
        rules: { 'no-unused-vars': 'off', 'no-undef': 'off' },
    },
];
