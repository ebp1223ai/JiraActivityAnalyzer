import { VIEWER_DEFAULT_COLUMNS_V050 } from './viewerQueryIdentityV050';

export function viewerDefaultColumnsV051(kind: 'ai' | 'integrated'): string[] {
  return kind === 'ai' ? VIEWER_DEFAULT_COLUMNS_V050.filter(id => id !== 'action') : [...VIEWER_DEFAULT_COLUMNS_V050];
}

export function viewerRequiredColumnsV051(kind: 'ai' | 'integrated'): string[] | undefined {
  return kind === 'ai' ? ['issueKey'] : undefined;
}
