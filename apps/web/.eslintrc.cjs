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
};
