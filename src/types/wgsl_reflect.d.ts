// wgsl_reflect@1.5.0 has no "exports" map, so its real types (types/index.d.ts)
// aren't wired up for the deep import path we use to route around the
// package's own ESM/CJS bug (see src/gpu/kernels.test.ts's import comment).
// Re-declaring the module here points TS at those same real types.
declare module "wgsl_reflect/wgsl_reflect.module.js" {
  export * from "wgsl_reflect";
}
