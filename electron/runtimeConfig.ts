import fs from "node:fs";
import path from "node:path";

export const ENV_FORMAT_VERSION = "2";

export const DEFAULT_ENV_TEXT = `# Jira Activity Analyzer runtime configuration / Jira Activity Analyzer 執行階段設定
# This local file may contain credentials. Never commit it. / 此本機檔案可能包含憑證，切勿提交。

# Environment format version / 環境設定格式版本
ENV_FORMAT_VERSION=2

# Jira base URL / Jira 伺服器網址
JIRA_BASE_URL=

# Jira username or email / Jira 使用者名稱或電子郵件
JIRA_USERNAME=

# Optional Jira email alias for backward compatibility / 向後相容的 Jira 電子郵件別名
JIRA_EMAIL=

# Jira API token / Jira API Token
JIRA_API_TOKEN=

# Jira API version / Jira API 版本
JIRA_API_VERSION=2

# Jira authentication mode / Jira 驗證方式
JIRA_AUTH_MODE=bearer

# Current local database path, relative to APP_ROOT or absolute / 目前本機資料庫路徑，可相對於 APP_ROOT 或使用絕對路徑
LOCAL_DATABASE_PATH=

# Application log level / 應用程式紀錄層級
LOG_LEVEL=DEBUG
`;

export type RuntimeConfig = {
  envFormatVersion: string;
  jiraBaseUrl: string;
  jiraUsername: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraApiVersion: "auto" | "v2" | "v3";
  jiraAuthMode: "basic" | "bearer";
  localDatabasePath: string;
  logLevel: string;
  values: Record<string, string>;
  sources: Record<string, "env" | "legacy_alias" | "default">;
};

export function parseEnvText(text: string) {
  const output: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const quoted = rawValue.match(/^(["'])([\s\S]*)\1$/);
    output[key] = quoted ? quoted[2] : rawValue;
  }
  return output;
}

function first(
  values: Record<string, string>,
  keys: string[],
  fallback: string,
  sources: RuntimeConfig["sources"],
  outputKey: string
) {
  for (let index = 0; index < keys.length; index += 1) {
    const value = values[keys[index]];
    if (value !== undefined && value !== "") {
      sources[outputKey] = index === 0 ? "env" : "legacy_alias";
      return value;
    }
  }
  sources[outputKey] = "default";
  return fallback;
}

export function runtimeConfigFromValues(values: Record<string, string>): RuntimeConfig {
  const sources: RuntimeConfig["sources"] = {};
  const apiVersionValue = first(values, ["JIRA_API_VERSION"], "2", sources, "jiraApiVersion").toLowerCase().replace(/^v/, "");
  const authModeValue = first(values, ["JIRA_AUTH_MODE", "JIRA_AUTH_TYPE"], "bearer", sources, "jiraAuthMode").toLowerCase();
  const jiraUsername = first(values, ["JIRA_USERNAME", "JIRA_USER", "JIRA_EMAIL"], "", sources, "jiraUsername");
  const jiraEmail = first(values, ["JIRA_EMAIL", "JIRA_USERNAME", "JIRA_USER"], jiraUsername, sources, "jiraEmail");
  return {
    envFormatVersion: first(values, ["ENV_FORMAT_VERSION"], ENV_FORMAT_VERSION, sources, "envFormatVersion"),
    jiraBaseUrl: first(values, ["JIRA_BASE_URL"], "", sources, "jiraBaseUrl"),
    jiraUsername,
    jiraEmail,
    jiraApiToken: first(values, ["JIRA_API_TOKEN"], "", sources, "jiraApiToken"),
    jiraApiVersion: apiVersionValue === "3" ? "v3" : apiVersionValue === "auto" ? "auto" : "v2",
    jiraAuthMode: authModeValue === "basic" ? "basic" : "bearer",
    localDatabasePath: first(values, ["LOCAL_DATABASE_PATH"], "", sources, "localDatabasePath"),
    logLevel: first(values, ["LOG_LEVEL", "JIRA_PROBE_LOG_LEVEL"], "DEBUG", sources, "logLevel").toUpperCase(),
    values: { ...values },
    sources
  };
}

export function assertRuntimeEnvPath(envPath: string) {
  if (path.basename(envPath).toLowerCase() === ".env.version") {
    throw new Error(".env.Version is a versioned template and cannot be loaded as runtime configuration.");
  }
  return path.resolve(envPath);
}

export function loadRuntimeConfig(envPath: string) {
  const resolved = assertRuntimeEnvPath(envPath);
  return runtimeConfigFromValues(parseEnvText(fs.readFileSync(resolved, "utf8")));
}

export function patchEnvText(text: string, updates: Record<string, string>) {
  const remaining = new Map(Object.entries(updates).map(([key, value]) => [key, String(value)]));
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match || !remaining.has(match[2])) return line;
    const value = remaining.get(match[2])!;
    remaining.delete(match[2]);
    return `${match[1]}${match[2]}${match[3]}${value}`;
  });
  if (remaining.size > 0 && lines.at(-1) !== "") lines.push("");
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  return lines.join(newline);
}

type AtomicFileSystem = Pick<typeof fs,
  "readFileSync" | "openSync" | "writeFileSync" | "fsyncSync" | "closeSync" | "renameSync" | "unlinkSync"
>;

export function atomicPatchEnv(
  envPath: string,
  updates: Record<string, string>,
  fileSystem: AtomicFileSystem = fs
) {
  const resolved = assertRuntimeEnvPath(envPath);
  const original = fileSystem.readFileSync(resolved, "utf8");
  const patched = patchEnvText(original, updates);
  const temporaryPath = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = fileSystem.openSync(temporaryPath, "wx", 0o600);
    fileSystem.writeFileSync(descriptor, patched, "utf8");
    fileSystem.fsyncSync(descriptor);
    fileSystem.closeSync(descriptor);
    descriptor = undefined;
    fileSystem.renameSync(temporaryPath, resolved);
    return { envPath: resolved, updatedKeys: Object.keys(updates), text: patched };
  } catch (error) {
    if (descriptor !== undefined) {
      try { fileSystem.closeSync(descriptor); } catch { /* Preserve the original error. */ }
    }
    try { fileSystem.unlinkSync(temporaryPath); } catch { /* Temporary file may not exist. */ }
    throw error;
  }
}

const secretKeyPattern = /token|authorization|cookie|password|secret/i;

export function redactConfigValue(key: string, value: unknown): unknown {
  if (secretKeyPattern.test(key)) return value ? "[masked]" : "";
  if (Array.isArray(value)) return value.map((item) => redactConfigValue("", item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
      nestedKey,
      redactConfigValue(nestedKey, nestedValue)
    ]));
  }
  return value;
}

export function ensureDefaultRuntimeEnv(envPath: string) {
  const resolved = assertRuntimeEnvPath(envPath);
  if (fs.existsSync(resolved)) return { envPath: resolved, created: false };
  fs.writeFileSync(resolved, DEFAULT_ENV_TEXT, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { envPath: resolved, created: true };
}
