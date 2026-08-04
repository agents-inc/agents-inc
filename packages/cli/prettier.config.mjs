/**
 * @typedef {import("prettier").Config} PrettierConfig
 * @typedef {import("prettier").Options} PrettierOptions
 */

/** @type {PrettierConfig} */
const config = {
  printWidth: 100,
  useTabs: false,
  tabWidth: 2,
  trailingComma: "all",
  semi: true,
  singleQuote: false,
  quoteProps: "as-needed",
  arrowParens: "always",
  bracketSpacing: true,
};

export default config;
