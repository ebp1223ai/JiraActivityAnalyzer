import path from "node:path";

export type FullFetchStagingPathInput = {
  appRoot: string;
  override?: string;
  allowDevelopmentOverride?: boolean;
};

export function resolveFullFetchStagingRoot(input: FullFetchStagingPathInput) {
  if (input.allowDevelopmentOverride && input.override) return path.resolve(input.override);
  return path.join(path.resolve(input.appRoot), "full-fetch-staging");
}
