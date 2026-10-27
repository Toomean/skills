export default (rules) => `---
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

1. ${rules["T1 — Trace dependencies before claiming independence"]}
2. ${rules["T2 — Inspect source before relying on package behavior"]}
3. ${rules["T3 — Verify infrastructure at the owning layer"]}
4. ${rules["T4 — Verify provenance with Git"]}
5. ${rules["T5 — Diagnose tool rejection before attributing intent"]}
6. ${rules["T6 — Search the full surface before claiming absence"]}
7. ${rules["T7 — Treat reported steps as ground truth"]}

### Instrument traps

${rules["S4 — Instrument traps introduction"]}

8. ${rules["T8 — Verify ambient environment propagation"]}
9. ${rules["T9 — Prefer standard tools over substitutes"]}
10. ${rules["T10 — Diagnose hook failures and hidden stashes"]}
11. ${rules["T11 — Preserve signal-carrying exit codes"]}
12. ${rules["T12 — Diagnose repeated infrastructure failures"]}
13. ${rules["T13 — Validate declarative artifacts natively"]}
14. ${rules["T14 — Test a live deny chokepoint"]}
15. ${rules["T15 — Reproduce under relevant runtime layers"]}
16. ${rules["T16 — Audit the probe harness itself"]}

## Per-task workflow

${rules["S5 — Workflow scope"]}

1. ${rules["W1 — Plan agreement first"]}
2. ${rules["W2 — Implementer role"]}
3. ${rules["W3 — Two reviewer contexts"]}
4. ${rules["W4 — Synthesize reviews"]}
5. ${rules["W5 — Empirical verification"]}
6. ${rules["W6 — End-of-step sweep"]}
7. ${rules["W7 — Commit"]}
8. ${rules["W8 — Independent commit review"]}

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
