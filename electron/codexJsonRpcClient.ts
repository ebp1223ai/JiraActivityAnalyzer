import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { redactChatGptText, sanitizedError } from "./chatGptRedactor.js";

const MAX_LINE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

type JsonObject = Record<string, unknown>;
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

export class CodexJsonRpcClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private initialized = false;
  private stopping = false;

  constructor(private readonly executablePath: string, private readonly codexHome: string, private readonly diagnostics: (message: string) => void = () => undefined, private readonly serverArgs: string[] = ["app-server", "--stdio"]) { super(); }

  async start() {
    if (this.child) return;
    this.stopping = false;
    const child = spawn(this.executablePath, this.serverArgs, {
      env: { ...process.env, CODEX_HOME: this.codexHome }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.consume(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => this.diagnostics(redactChatGptText(chunk)));
    child.once("error", (error) => this.failAll("CODEX_RUNTIME_START_FAILED", error));
    child.once("exit", (code, signal) => {
      this.child = null;
      this.initialized = false;
      this.failAll(this.stopping ? "CODEX_RUNTIME_STOPPED" : "CODEX_RUNTIME_EXITED", new Error(`exit=${code ?? "null"} signal=${signal ?? "null"}`));
      this.emit("exit", { code, signal, expected: this.stopping });
    });
    await this.request("initialize", { clientInfo: { name: "jira-activity-analyzer", title: "Jira Activity Analyzer", version: "0.3.9" }, capabilities: { experimentalApi: true } }, DEFAULT_TIMEOUT_MS);
    this.notify("initialized");
    this.initialized = true;
  }

  isReady() { return Boolean(this.child && this.initialized); }

  request(method: string, params: unknown = undefined, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    if (!this.child?.stdin.writable) return Promise.reject(new Error("CODEX_RUNTIME_NOT_RUNNING"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CODEX_REQUEST_TIMEOUT:${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ method, id, ...(params === undefined ? {} : { params }) }, id);
    });
  }

  notify(method: string, params?: unknown) { this.write({ method, ...(params === undefined ? {} : { params }) }); }

  respond(id: unknown, result: unknown) { this.write({ id, result }); }

  respondError(id: unknown, code: number, message: string) { this.write({ id, error: { code, message } }); }

  async stop() {
    if (!this.child) return;
    this.stopping = true;
    const child = this.child;
    child.stdin.end();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { child.kill(); resolve(); }, 1500);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  }

  private write(message: JsonObject, pendingId?: number) {
    try { this.child?.stdin.write(JSON.stringify(message) + "\n"); }
    catch (error) {
      if (pendingId !== undefined) {
        const pending = this.pending.get(pendingId);
        if (pending) { clearTimeout(pending.timer); this.pending.delete(pendingId); pending.reject(new Error(`CODEX_STDIN_WRITE_FAILED:${sanitizedError(error)}`)); }
      }
    }
  }

  private consume(chunk: string) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, "utf8") > MAX_LINE_BYTES && !this.buffer.includes("\n")) {
      this.failAll("CODEX_JSONL_LINE_TOO_LARGE", new Error("App Server emitted an oversized JSONL line."));
      this.child?.kill(); return;
    }
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.parseLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private parseLine(line: string) {
    if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) { this.emit("protocolError", new Error("CODEX_JSONL_LINE_TOO_LARGE")); return; }
    let message: JsonObject;
    try { message = JSON.parse(line) as JsonObject; }
    catch { this.emit("protocolError", new Error("CODEX_JSONL_MALFORMED")); return; }
    if ("id" in message && ("result" in message || "error" in message) && typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) { this.emit("protocolError", new Error("CODEX_UNKNOWN_RESPONSE_ID")); return; }
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`CODEX_RPC_ERROR:${redactChatGptText(JSON.stringify(message.error))}`));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method === "string" && "id" in message) { this.emit("request", message); return; }
    if (typeof message.method === "string") this.emit("notification", message);
  }

  private failAll(code: string, cause: unknown) {
    const error = new Error(`${code}:${sanitizedError(cause)}`);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}
