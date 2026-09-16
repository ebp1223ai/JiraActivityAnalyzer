import { parentPort, workerData } from 'node:worker_threads';
import { checkCurrentStateDatabaseCompatibility } from './currentStateArchive.js';
import { databaseRevisionV045 } from './databaseRevisionV045.js';
import { compatibilityObservationV050 } from './databaseCompatibilityObservationV050.js';

const { file, jiraIdentity } = workerData;
const started = performance.now();
try {
  const before = compatibilityObservationV050(file);
  const revision = before ? databaseRevisionV045(file) : '';
  const critical = checkCurrentStateDatabaseCompatibility(file, jiraIdentity, { criticalOnly: true });
  if (before !== compatibilityObservationV050(file)) throw Error('DATABASE_CHANGED_DURING_VALIDATION');
  parentPort?.postMessage({ type: 'critical', value: critical, observation: before, elapsedMs: performance.now() - started });
  if (critical.canRead) {
    const healthStarted = performance.now();
    const value = checkCurrentStateDatabaseCompatibility(file, jiraIdentity);
    if (before !== compatibilityObservationV050(file) || revision !== databaseRevisionV045(file)) throw Error('DATABASE_CHANGED_DURING_HEALTH');
    parentPort?.postMessage({ type: 'health', value, observation: before, elapsedMs: performance.now() - healthStarted });
  }
} catch (error) {
  parentPort?.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'DATABASE_CHECK_FAILED' });
}
