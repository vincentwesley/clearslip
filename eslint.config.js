import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/credits/credits.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["scripts/**"], languageOptions: { globals: { console: "readonly" } } },
);
