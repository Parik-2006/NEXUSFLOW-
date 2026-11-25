// Phase 2 (Task 11): let Node's runner resolve extensionless relative imports
// ("../utils/taskSort") to their .ts source, as Metro/TypeScript do.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
