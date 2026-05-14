/**
 * ESLint config for @yelli/tools — CLI governance scripts.
 *
 * The tools/ workspace contains stand-alone Node.js ESM scripts (.mjs) that
 * run via `node tools/<name>.mjs`. They are CLI tools — console output is
 * intentional (success messages, error reports, warnings to the operator).
 * The Ajv/js-yaml default-import warnings are intrinsic to those library
 * shapes; disabling them is the documented workaround.
 */
module.exports = {
  root: true,
  extends: ["../.eslintrc.js"],
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  rules: {
    // CLI tools — console output IS the interface.
    "no-console": "off",
    // Ajv exposes Ajv2020 as a "default" with named-export overlap; js-yaml
    // similarly exposes `load` both as default and named. The ESM-friendly
    // imports we use are the documented patterns.
    "import/no-named-as-default": "off",
    "import/no-named-as-default-member": "off",
  },
  overrides: [
    {
      files: ["*.mjs"],
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ],
};
