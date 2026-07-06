import { buildInfo } from "../buildInfo";

export function BuildInfo() {
  return (
    <div className="text-xs font-semibold leading-relaxed text-muted">
      <div data-no-clip="true">Build Time / 建置時間</div>
      <div className="font-black text-ink" data-no-clip="true">{buildInfo.buildTime}</div>
    </div>
  );
}
