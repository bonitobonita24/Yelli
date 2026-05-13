/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  extends: [
    "../../.eslintrc.js",
    "next/core-web-vitals",
  ],
  rules: {
    // App Router does not use /pages — disable pages-dir link rule
    "@next/next/no-html-link-for-pages": "off",
  },
  overrides: [
    {
      // Server-side tRPC and route handler files legitimately import from @yelli/db (Rule 13 exemption).
      // Client-side code (src/app/, src/components/, src/lib/) must still use packages/api-client.
      files: ["src/server/**/*.ts", "src/server/**/*.tsx"],
      rules: {
        "no-restricted-syntax": "off",
      },
    },
  ],
};
