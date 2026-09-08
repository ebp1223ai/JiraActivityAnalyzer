import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { automaticDiagnosticsV044 } from './automaticDiagnosticsV044.js';
export const ipcCoverageV044 = new Set<string>();
export function instrumentedHandleV044(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any) {
  ipcCoverageV044.add(channel);
  ipcMain.handle(channel, async (event, ...args) => {
    const diagnostics = automaticDiagnosticsV044();
    if (!diagnostics || channel.startsWith('diagnostics:')) return handler(event, ...args);
    if (diagnostics.isClosing()) return { ok: false, errorCode: 'APP_SHUTTING_DOWN' };
    return diagnostics.operation(`ipc.${channel}`, () => handler(event, ...args), { channel, argumentTypes: args.map(v => Array.isArray(v) ? 'array' : typeof v), rendererId: event.sender.id });
  });
}
