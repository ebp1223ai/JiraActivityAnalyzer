import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Details = Record<string, unknown>;
type Sink = (details: Details) => void;
let sink: Sink | undefined;
let appRoot = '';
export function configureBusinessIoV044(next: Sink | undefined, root = '') { sink = next; appRoot = root; }
const descriptors = new Map<number, string>();
const recent = new Map<string, { at: number; count: number }>();
function location(value: unknown): string | null {
  try {
    if (typeof value === 'number') return descriptors.get(value) ?? null;
    if (value instanceof URL) return fileURLToPath(value);
    return typeof value === 'string' || Buffer.isBuffer(value) ? path.resolve(String(value)) : null;
  } catch { return null; }
}
function emit(operation: string, target: string | null, phase: string, error?: unknown) {
  if (!sink || !target) return;
  const key = operation + ':' + target + ':' + phase + ':' + ((error as NodeJS.ErrnoException)?.code ?? '');
  const prior = recent.get(key), now = performance.now();
  if (prior && now - prior.at < 2000) { prior.count++; return; }
  const coalescedInvocationCount = (prior?.count ?? 0) + 1;
  if (recent.size >= 2048) recent.delete(recent.keys().next().value!);
  recent.set(key, { at: now, count: 0 });
  const relative = appRoot ? path.relative(appRoot, target) : null;
  const inside = relative !== null && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  // This local facade never replaces Node's global exports or observes the log writer.
  try { sink({ operation, path: target, phase, coalescedInvocationCount, pathPolicy: inside ? 'APP_ROOT' : 'EXTERNAL_PATH_REQUIRES_CALLER_POLICY', errorCode: (error as NodeJS.ErrnoException)?.code ?? null }); } catch { /* Observation cannot change the file operation outcome. */ }
}
const observed = /^(?:open|close|read|write|appendFile|rename|copyFile|cp|mkdir|unlink|rm|createReadStream|createWriteStream)/;
function facade<T extends object>(source: T, promiseApi = false): T {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(source, { get(target, key) {
    if (key === 'promises') return promises;
    const value = Reflect.get(target, key);
    if (typeof value !== 'function' || !observed.test(String(key))) return value;
    if (methods.has(key)) return methods.get(key);
    const wrapped = (...args: any[]) => {
      if (!sink) return Reflect.apply(value, target, args);
      const name = String(key), file = location(args[0]);
      emit(name, file, 'BEGIN');
      if (/^(rename|copyFile|cp)/.test(name)) emit(name + '-destination', location(args[1]), 'BEGIN');
      const done = (error?: unknown, result?: any) => {
        if (/^open/.test(name) && !error && typeof result === 'number' && file && descriptors.size < 4096) descriptors.set(result, file);
        if (/^close/.test(name) && !error) descriptors.delete(args[0]);
        emit(name, file, error ? 'FAILED' : 'END', error);
      };
      try {
        const last = args.length - 1;
        if (!promiseApi && typeof args[last] === 'function') {
          const callback = args[last]; args[last] = function (this: unknown, error: unknown, ...rest: unknown[]) { done(error, rest[0]); return callback.call(this, error, ...rest); };
          return Reflect.apply(value, target, args);
        }
        const result = Reflect.apply(value, target, args);
        if (promiseApi) return Promise.resolve(result).then(v => { done(undefined, v); return v; }, e => { done(e); throw e; });
        if (/^create.*Stream$/.test(name)) { result.once('error', (e: unknown) => done(e)); result.once('close', () => emit(name, file, 'CLOSED')); }
        else done(undefined, result);
        return result;
      } catch (error) { done(error); throw error; }
    };
    methods.set(key, wrapped); return wrapped;
  } });
}
const promises = facade(fs.promises, true);
export default facade(fs);
