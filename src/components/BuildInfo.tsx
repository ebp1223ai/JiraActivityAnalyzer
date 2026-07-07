import { buildInfo } from "../buildInfo";

export function BuildInfo() {
  return (
    <div className="text-xs font-semibold leading-relaxed text-muted">
      <div data-no-clip="true">Version / 版本</div>
      <div className="font-black text-ink" data-no-clip="true">{buildInfo.version}</div>
      <div className="mt-2" data-no-clip="true">Build Time / 建置時間</div>
      <div className="font-black text-ink" data-no-clip="true">{buildInfo.buildTime}</div>
      <div className="mt-2 truncate" title={`${buildInfo.gitBranch} ${buildInfo.gitCommit}`} data-allow-truncate="true">
        {buildInfo.gitBranch} / {buildInfo.gitCommit}
      </div>
    </div>
  );
}
