// eslint-plugin-jsx-a11y ships no type declarations. eslint.config.mjs is
// itself typechecked (tsconfig includes **/*.mjs, and it opts in via
// `// @ts-check`), so this ambient shim is enough to keep that check honest
// about everything else without pulling in a whole @types package for one
// import.
declare module "eslint-plugin-jsx-a11y";
