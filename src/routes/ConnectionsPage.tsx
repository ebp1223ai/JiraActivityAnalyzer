import { Cloud, Database, FolderOpen, KeyRound, Save, ShieldCheck, UserCheck } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { Chip, FieldLabel } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";

export function ConnectionsPage() {
  return (
    <div>
      <PageHeader title="連線設定" subtitle="Connections" />
      <SectionCard>
        <h2 className="mb-5 flex items-center gap-3 text-xl font-black"><Cloud className="text-blue-600" />Jira Cloud Connection</h2>
        <div className="grid grid-cols-[220px_1fr] gap-x-5 gap-y-4">
          <FieldLabel label="連線名稱" sub="Connection Name" /><input className="field" defaultValue="Jira Cloud (Production)" />
          <FieldLabel label="Jira 基礎 URL" sub="Jira Base URL" /><input className="field" defaultValue="https://copgen1.atlassian.net" />
          <FieldLabel label="電子郵件 / 使用者名稱" sub="Email / Username" /><input className="field" defaultValue="alpha.platform@copgen1.com" />
          <FieldLabel label="API 權杖" sub="API Token" /><div className="flex gap-2"><input className="field" defaultValue="••••••••••••••••••••••••••••••••" /><button className="btn">Show</button></div>
          <FieldLabel label="專案範圍" sub="Project Scope" /><div className="field flex items-center gap-2"><Chip>COPGEN1</Chip><Chip>FW</Chip><Chip>QA</Chip></div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700"><b>連線成功</b><br /><span className="text-sm">Successfully connected to Jira Cloud.</span></div>
          <div className="flex gap-3"><button className="btn">測試連線<br />Test Connection</button><button className="btn btn-primary"><Save size={16} />儲存 Save</button><button className="btn text-slate-700">重設 Reset</button></div>
        </div>
      </SectionCard>
      <SectionCard className="mt-4" title="連線狀態" subtitle="Connection Status">
        <div className="grid grid-cols-5 gap-3">
          <MetricCard label="已驗證使用者" sub="Authenticated User" value="alpha.platform" icon={UserCheck} tone="bg-green-50 text-green-600" />
          <MetricCard label="可存取專案數" sub="Accessible Projects" value="48" icon={FolderOpen} />
          <MetricCard label="權杖範圍" sub="Token Scope" value="read:jira" icon={ShieldCheck} tone="bg-violet-50 text-violet-600" />
          <MetricCard label="上次測試時間" sub="Last Tested" value="15:43:21" icon={KeyRound} tone="bg-amber-50 text-amber-600" />
          <MetricCard label="API 版本" sub="Api Version" value="3" icon={Database} tone="bg-cyan-50 text-cyan-600" />
        </div>
      </SectionCard>
      <SectionCard className="mt-4" title="已儲存連線" subtitle="Saved Connections" action={<button className="btn">+ 新增連線 Add Connection</button>}>
        <DataTable
          headers={["Connection Name", "Jira Base URL", "User", "Projects", "Status", "Last Tested", "Actions"]}
          rows={[
            ["Jira Cloud (Production)", "https://copgen1.atlassian.net", "alpha.platform@copgen1.com", "48", <StatusBadge>Connected</StatusBadge>, "2026/07/03 15:43:21", <div className="flex gap-2"><button className="btn">Test</button><button className="btn">Edit</button><button className="btn btn-danger">Delete</button></div>],
            ["Jira Cloud (Staging)", "https://copgen1-staging.atlassian.net", "alpha.platform@copgen1.com", "23", <StatusBadge>Connected</StatusBadge>, "2026/07/02 11:22:09", <div className="flex gap-2"><button className="btn">Test</button><button className="btn">Edit</button><button className="btn btn-danger">Delete</button></div>],
            ["Jira Cloud (QA)", "https://copgen1-qa.atlassian.net", "qa.platform@copgen1.com", "15", <StatusBadge tone="gray">Disconnected</StatusBadge>, "2026/06/28 09:18:34", <div className="flex gap-2"><button className="btn">Test</button><button className="btn">Edit</button><button className="btn btn-danger">Delete</button></div>]
          ]}
        />
      </SectionCard>
    </div>
  );
}
