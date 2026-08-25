export const ARTIFACT_LIFECYCLE_VERSION_V0337 = "jaa-artifact-lifecycle-v1" as const;
export type ArtifactStateV0337 = "not_started" | "received" | "persisted" | "content_validated" | "formally_published";
const ORDER: ArtifactStateV0337[] = ["not_started", "received", "persisted", "content_validated", "formally_published"];
export class ArtifactLifecycleV0337 {
  private state: ArtifactStateV0337 = "not_started";
  transition(next: Exclude<ArtifactStateV0337, "not_started">) {
    const current = ORDER.indexOf(this.state); const target = ORDER.indexOf(next);
    if (target === current) return this.state;
    if (target !== current + 1) throw Object.assign(new Error(`AI_ARTIFACT_STATE_TRANSITION_INVALID:${this.state}->${next}`), { code: "AI_ARTIFACT_STATE_TRANSITION_INVALID" });
    this.state = next; return this.state;
  }
  snapshot() { return Object.freeze({ schemaVersion: ARTIFACT_LIFECYCLE_VERSION_V0337, state: this.state }); }
}