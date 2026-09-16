import fs from 'node:fs';
export function compatibilityObservationV050(file: string) {
  if (!file || !fs.existsSync(file)) return '';
  return JSON.stringify([file, file + '-wal'].map(name => {
    try {
      const s = fs.statSync(name);
      // SQLite may create an empty WAL when the first reader opens a WAL-mode DB.
      // Zero bytes contain no committed revision; nonempty WAL identity remains strict.
      if (name !== file && s.size === 0) return null;
      return [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs, s.birthtimeMs];
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }));
}
