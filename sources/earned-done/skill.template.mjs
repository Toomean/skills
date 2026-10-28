export default (rules) => {
  // Keep outer list indentation here so catalogue bodies stay placement-independent.
  const numberedListItem = (number, body) => body
    .split("\n")
    .map((line, index) => index === 0
      ? `${number}. ${line}`
      : line === "" ? "" : `${" ".repeat(String(number).length + 2)}${line}`)
    .join("\n");

  return `---
name: earned-done
description: Evidence-first orchestration and review for coding agents. Use for non-trivial planning, implementation, review, empirical verification, or design conclusions. Preserves independent roles, capability-aware routing, evidence before claims, and the ReviewTaste and CodeReview playbooks.
---

# Earned Done

Protocol revision: 2026-08-31-r030. ${rules["S15 — Stable IDs and retirement"]}

${rules["S1 — Portable scope"]}

## On launch — select the provider and declare the stance

${rules["S2 — Launch stance and load signal"]}

## Core rule [C1]: empirical verification before claim

${rules["C1 — Empirical verification before claim"]}

## Core rule [C2]: preserve independent roles; delegate when available

${rules["C2 — Preserve independent roles and delegate when available"]}

## Recurring failure modes — guard against

${rules["S3 — Trap scope and routing"]}

### Reasoning traps

${numberedListItem(1, rules["T1 — Trace dependencies before claiming independence"])}
${numberedListItem(2, rules["T2 — Inspect source before relying on package behavior"])}
${numberedListItem(3, rules["T3 — Verify infrastructure at the owning layer"])}
${numberedListItem(4, rules["T4 — Verify provenance with Git"])}
${numberedListItem(5, rules["T5 — Diagnose tool rejection before attributing intent"])}
${numberedListItem(6, rules["T6 — Search the full surface before claiming absence"])}
${numberedListItem(7, rules["T7 — Treat reported steps as ground truth"])}

### Instrument traps

${rules["S4 — Instrument traps introduction"]}

${numberedListItem(8, rules["T8 — Verify ambient environment propagation"])}
${numberedListItem(9, rules["T9 — Prefer standard tools over substitutes"])}
${numberedListItem(10, rules["T10 — Diagnose hook failures and hidden stashes"])}
${numberedListItem(11, rules["T11 — Preserve signal-carrying exit codes"])}
${numberedListItem(12, rules["T12 — Diagnose repeated infrastructure failures"])}
${numberedListItem(13, rules["T13 — Validate declarative artifacts natively"])}
${numberedListItem(14, rules["T14 — Test a live deny chokepoint"])}
${numberedListItem(15, rules["T15 — Reproduce under relevant runtime layers"])}
${numberedListItem(16, rules["T16 — Audit the probe harness itself"])}

## Per-task workflow

${rules["S5 — Workflow scope"]}

${numberedListItem(1, rules["W1 — Plan agreement first"])}
${numberedListItem(2, rules["W2 — Implementer role"])}
${numberedListItem(3, rules["W3 — Two reviewer contexts"])}
${numberedListItem(4, rules["W4 — Synthesize reviews"])}
${numberedListItem(5, rules["W5 — Empirical verification"])}
${numberedListItem(6, rules["W6 — End-of-step sweep"])}
${numberedListItem(7, rules["W7 — Commit"])}
${numberedListItem(8, rules["W8 — Independent commit review"])}

${rules["S6 — Implementation handoff"]}

## Degraded modes — shedding order under budget/context pressure

${rules["S7 — Degraded modes"]}

## Code review — see [CodeReview](CodeReview.md)

${rules["S8 — Review playbook routing"]}

## Review taste — apply at write-time, not just review-time

${rules["S9 — ReviewTaste write-time guidance"]}

## Independent validator rule

${rules["S10 — Independent validator"]}

## Capability awareness

${rules["S11 — Capability awareness"]}

## Memory hygiene

${rules["S12 — Memory hygiene"]}

## Evolution

${rules["S13 — Evolution"]}

## Communication style

${rules["S14 — Communication style"]}
`;
};
