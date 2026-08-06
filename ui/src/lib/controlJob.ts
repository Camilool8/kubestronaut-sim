import type { ControlJob } from "../api";
import { strings } from "../strings";

export function controlJobTitle(job: ControlJob, bankTitle?: string): string {
  const target = bankTitle || job.bank;
  switch (job.op) {
    case "switch":
      return strings.control.switchTitle(target);
    case "provision":
      return strings.control.provisionTitle(target);
    case "seed":
      return strings.control.seedTitle;
    default:
      return strings.control.resetTitle;
  }
}

export function controlJobHint(job: ControlJob): string {
  if (job.op === "seed") return strings.control.hintSeed;
  if (!job.phases.some((p) => p.id === "recreate-cluster")) return strings.control.hintFast;
  return job.op === "provision" ? strings.control.hintProvision : strings.control.hint;
}
