module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  ignorePatterns: ["dist/**", "build/**", ".turbo/**", "node_modules/**"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "prettier"
  ],
  plugins: ["@typescript-eslint", "react", "react-hooks", "jsx-a11y"],
  settings: {
    react: {
      version: "detect"
    }
  },
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: "./tsconfig.base.json"
      },
      rules: {
        "@typescript-eslint/explicit-function-return-type": "off"
      }
    }
  ]
};
