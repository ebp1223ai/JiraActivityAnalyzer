declare const __BUILD_TIME__: string;
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __GIT_BRANCH__: string;

export const buildInfo = {
  buildTime: typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "Development Mode",
  timezone: "Asia/Taipei / UTC+08:00",
  version: typeof __APP_VERSION__ === "string" ? `v${__APP_VERSION__}` : "Development",
  gitCommit: typeof __GIT_COMMIT__ === "string" ? __GIT_COMMIT__ : "unknown",
  gitBranch: typeof __GIT_BRANCH__ === "string" ? __GIT_BRANCH__ : "unknown"
};
