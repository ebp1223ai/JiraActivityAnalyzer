import { buildInfo } from "../buildInfo";

export function BuildInfo() {
  return (
    <div className="text-xs font-semibold leading-relaxed text-muted">
      <div>Build Time / 建置時間</div>
      <div className="font-black text-ink">{buildInfo.buildTime}</div>
    </div>
  );
}
