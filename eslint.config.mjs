import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";

const commonGlobals = Object.fromEntries(
  [
    "console",
    "process",
    "Buffer",
    "crypto",
    "Request",
    "Response",
    "Headers",
    "URL",
    "URLSearchParams",
    "TextEncoder",
    "TextDecoder",
    "ReadableStream",
    "fetch",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "AbortController",
    "DOMException",
    "FormData",
    "window",
    "document",
    "location",
    "history",
    "innerWidth",
    "sessionStorage",
    "localStorage",
    "getComputedStyle",
    "performance",
    "structuredClone",
    "navigator",
  ].map((name) => [name, "readonly"]),
);
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".sites-runtime/**",
      ".vercel/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs}"],
    languageOptions: { globals: commonGlobals },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks, "jsx-a11y": a11y },
    rules: {
      ...a11y.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
