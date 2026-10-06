// .eslintrc.cjs
const path = require("path");
const { FlatCompat } = require("@eslint/eslintrc");
const tseslint = require("typescript-eslint");

const compat = new FlatCompat({
  baseDirectory: __dirname, // CJS equivalent of import.meta.dirname
});

module.exports = tseslint.config(
  {
    ignores: [".next"],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["**/*.ts", "**/*.tsx"],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  }
);
