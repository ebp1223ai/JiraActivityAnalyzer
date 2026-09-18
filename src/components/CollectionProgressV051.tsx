import type { CollectionSnapshotV051 } from '../../shared/multiUserCollectionV051';
import { ResponsiveTableContainer } from './Responsive';

export function CollectionProgressV051({ collection }: { collection?: CollectionSnapshotV051 }) {
  if (!collection) return null;
  return <div className="mt-4 min-w-0" data-testid="collection-progress">
    <p className="mb-2 text-sm font-semibold" role="status">Collection: {collection.status} · 重複發現：{collection.duplicateDiscoveryCount}</p>
    {collection.status === 'PARTIAL' ? <p className="mb-2 text-sm text-amber-800">部分使用者未完成；成功結果已保留。完整抓取仍須通過完整性檢查。</p> : null}
    <ResponsiveTableContainer><table className="data-table"><thead><tr><th>使用者</th><th>狀態</th><th>耗時</th><th>事件</th><th>診斷</th></tr></thead>
      <tbody>{collection.users.map(user => <tr key={user.id}><td className="break-all" title={user.id}>{user.displayName}</td><td>{user.status}</td><td>{user.status === 'PENDING' || user.status === 'RUNNING' ? '—' : (user.elapsedMs / 1000).toFixed(1) + ' s'}</td><td>{user.status === 'SUCCESS' ? user.eventCount : '—'}</td><td className="max-w-96 break-words">{user.error || '—'}</td></tr>)}</tbody></table></ResponsiveTableContainer>
  </div>;
}
