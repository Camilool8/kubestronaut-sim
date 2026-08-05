import type { ControlJob } from "../api";
import { strings } from "../strings";

/**
 * What to call a conductor job on screen.
 *
 * One definition because there are two surfaces — the overlay and the
 * backgrounded chip — and they must never disagree about what is
 * happening. They did: the chip titled ANY job carrying a bank as a
 * switch, so a pooled bank's seed job (which carries one) announced
 * itself as "Switching to CKAD Mock Exam 01" to a candidate who had
 * pressed Start and was waiting for their tasks to be set up.
 *
 * `target` is the catalog title when the caller has resolved one; the
 * bank slug is the fallback and is never preferred — the slug is an
 * implementation detail nobody outside the repo should have to read.
 */
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

/**
 * The one line of reassurance under the checklist.
 *
 * Keyed on the job's own phase list rather than a prop: an mcq switch or
 * reset simply never declares `recreate-cluster` (see resetPhases and
 * switchPhases in the conductor), so its absence IS the "no cluster
 * rebuild, this takes seconds" signal, with nothing to thread through
 * and nothing that can fall out of sync with what the server is doing.
 */
export function controlJobHint(job: ControlJob): string {
  if (job.op === "seed") return strings.control.hintSeed;
  if (!job.phases.some((p) => p.id === "recreate-cluster")) return strings.control.hintFast;
  return job.op === "provision" ? strings.control.hintProvision : strings.control.hint;
}
