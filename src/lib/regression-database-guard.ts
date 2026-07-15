import * as regressionRuntime from "../../scripts/lib/regression-runtime.js";

export function isIsolatedRegressionRuntime(
  env: NodeJS.ProcessEnv = process.env,
) {
  return regressionRuntime.isIsolatedRegressionRuntimeDatabase(env);
}

export function requireIsolatedRegressionRuntime(
  env: NodeJS.ProcessEnv = process.env,
) {
  return regressionRuntime.requireIsolatedRegressionRuntimeDatabase(env);
}
