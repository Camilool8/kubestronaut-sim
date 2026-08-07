import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckList } from "./CheckList";
import type { CheckResult } from "../api";

const check = (over: Partial<CheckResult> & { name: string }): CheckResult => ({
  desc: "a check",
  points: 3,
  earned: 0,
  passed: false,
  message: "",
  ...over,
});

const criterionRows = () => [...document.querySelectorAll(".check-criterion")];

describe("CheckList criterion rows", () => {
  test("a partially-met check lists what it did and did not meet", () => {
    render(
      <CheckList
        checks={[
          check({
            name: "20_hardening.sh",
            desc: "no privilege escalation, read-only root filesystem",
            points: 3,
            earned: 2,
            message: "readOnlyRootFilesystem='false', want true",
            criteria: [
              { desc: "allowPrivilegeEscalation is false", weight: 1, passed: true },
              { desc: "all capabilities dropped", weight: 1, passed: true },
              { desc: "read-only root filesystem", weight: 1, passed: false },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("2/3")).toBeInTheDocument();

    const rows = criterionRows();
    expect(rows).toHaveLength(3);
    expect(rows[0].className).toContain("criterion-pass");
    expect(rows[1].className).toContain("criterion-pass");
    expect(rows[2].className).toContain("criterion-fail");
    expect(rows[2].textContent).toContain("read-only root filesystem");
  });

  // The score already says everything a full-marks breakdown could.
  test("a passing check shows no breakdown", () => {
    render(
      <CheckList
        checks={[
          check({
            name: "10_identity.sh",
            points: 2,
            earned: 2,
            passed: true,
            message: "identity ok",
            criteria: [
              { desc: "runs as uid 10001", weight: 1, passed: true },
              { desc: "refuses to start as root", weight: 1, passed: true },
            ],
          }),
        ]}
      />,
    );
    expect(criterionRows()).toHaveLength(0);
  });

  // A gate reports no criteria at all, and must still render as one clean row.
  test("a gated check with no criteria renders unchanged", () => {
    render(
      <CheckList
        checks={[
          check({
            name: "10_identity.sh",
            desc: "runs as uid 10001",
            points: 2,
            earned: 0,
            message: "pod vault-agent has no container named 'agent'",
          }),
        ]}
      />,
    );
    expect(criterionRows()).toHaveLength(0);
    expect(screen.getByText("0/2")).toBeInTheDocument();
    expect(
      screen.getByText("pod vault-agent has no container named 'agent'"),
    ).toBeInTheDocument();
  });

  test("a skipped check shows no breakdown even if criteria came through", () => {
    render(
      <CheckList
        checks={[
          check({
            name: "30_resources.sh",
            skipped: true,
            criteria: [{ desc: "requests 100m", weight: 1, passed: false }],
          }),
        ]}
      />,
    );
    expect(criterionRows()).toHaveLength(0);
  });

  test("two partially-met checks keep their criteria apart", () => {
    render(
      <CheckList
        checks={[
          check({
            name: "a.sh",
            earned: 1,
            criteria: [{ desc: "from a", weight: 1, passed: false }],
          }),
          check({
            name: "b.sh",
            earned: 1,
            criteria: [{ desc: "from b", weight: 1, passed: false }],
          }),
        ]}
      />,
    );
    const rows = criterionRows();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("from a");
    expect(rows[1].textContent).toContain("from b");
  });
});
