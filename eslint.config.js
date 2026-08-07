import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  // Leading **/ matters: "dist/**" only ever matched a dist folder at the repo
  // root, so a nested build output (packages/*/dist, ticker/dist) was linted as
  // if it were source and buried the real findings under hundreds of errors
  // about generated code.
  { ignores: ["**/dist/**", "**/build/**", "**/node_modules/**", "**/*.cjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // tsconfig.json deliberately includes only "src", so the root-level config
    // files (eslint.config.js, postcss.config.js, vite/tailwind configs) belong
    // to no TS project and the project service refuses to parse them. They are
    // build plumbing, not application source, so widening tsconfig's include to
    // cover them would drag them into the shipped type-check. allowDefaultProject
    // hands just those files to a default project instead, which keeps the
    // type-aware rules switched on for them without changing what tsc compiles.
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs", "*.cjs", "*.ts", "*.config.js", "*.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
