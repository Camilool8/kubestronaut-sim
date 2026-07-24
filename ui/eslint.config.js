import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Downgraded: the pre-existing fetch-in-effect patterns (QuestionPanel,
      // Score) trip this; they get restructured in the design-system phases.
      // Keep visible as warnings until then.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
);
