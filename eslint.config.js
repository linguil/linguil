import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import importPlugin from "eslint-plugin-import";

export default [
  // Global ignores for all configurations.
  {
    ignores: [
      ".firebase/",
      "node_modules/",
      ".next/",
      "out/",
      "build/",
      "dist/",
      ".devvit/",
      "function-kits/",
      "functions/lib/",
    ],
  },
  // Configuration for TypeScript and React files.
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react": pluginReact,
      "react-hooks": hooksPlugin,
      "@next/next": nextPlugin,
      "import": importPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
      "react": {
        version: "detect",
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules, // Recommended rules from typescript-eslint.
      ...pluginReact.configs.recommended.rules, // Recommended rules from eslint-plugin-react.
      ...pluginReact.configs['jsx-runtime'].rules, // Rules for the new JSX transform.
      ...nextPlugin.configs.recommended.rules, // Recommended rules from @next/eslint-plugin-next.
      ...nextPlugin.configs['core-web-vitals'].rules, // Core Web Vitals rules from @next/eslint-plugin-next.
      ...importPlugin.configs.typescript.rules, // TypeScript specific import rules.
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }], // Disallow unused variables, ignoring those that start with _.
      "react-hooks/rules-of-hooks": "error", // Enforces rules of Hooks.
      "react-hooks/exhaustive-deps": "warn", // Checks effect dependencies.
      "react/prop-types": "off", // Not needed with TypeScript.
    },
  },
  // Configuration specifically for Cloud Functions.
  {
    files: ["functions/src/**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      import: importPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "functions/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node, // Functions run in a Node.js environment.
      },
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      "quotes": ["error", "double"], // Enforce double quotes.
      "indent": ["error", 2], // Enforce 2-space indentation.
      "import/no-unresolved": "error", // Ensures all imports can be resolved.
    },
  }
];