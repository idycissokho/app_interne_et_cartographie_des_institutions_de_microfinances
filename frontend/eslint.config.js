// ESLint (configuration « flat ») : règles recommandées JavaScript + TypeScript, et règles des hooks React.
// Lancement : npm run lint
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "maquette-carto-imf"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2020, globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Variables préfixées par « _ » : volontairement inutilisées.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Espaces insécables voulues dans les formats français (lib/format.ts : « 1 234 »).
      "no-irregular-whitespace": ["error", { skipStrings: true, skipRegExps: true, skipTemplates: true }],
    },
  },
);
