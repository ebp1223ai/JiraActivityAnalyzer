declare const __BUILD_TIME__: string;

export const buildInfo = {
  buildTime: typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "Development Mode",
  timezone: "Asia/Taipei / UTC+08:00",
  version: "v1.3.0"
};
