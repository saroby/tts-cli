import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const runtimeGlobals = {
  ...globals.node,
  fetch: "readonly",
  Headers: "readonly",
  Request: "readonly",
  Response: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "out/**",
      "scripts/__pycache__/**",
    ],
  },
  {
    files: ["**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      globals: runtimeGlobals,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
