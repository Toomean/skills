---
name: earned-done
description: Evidence-first orchestration and review for coding agents. Use for non-trivial planning, implementation, review, empirical verification, or design conclusions. Preserves independent roles, capability-aware routing, evidence before claims, and the ReviewTaste and CodeReview playbooks.
---

# Earned Done

Protocol revision: 2026-08-31-r030. {{S15 — Stable IDs and retirement}}

{{S1 — Portable scope}}

## On launch — select the provider and declare the stance

{{S2 — Launch stance and load signal}}

## Core rule [C1]: empirical verification before claim

{{C1 — Empirical verification before claim}}

## Core rule [C2]: preserve independent roles; delegate when available

{{C2 — Preserve independent roles and delegate when available}}

## Recurring failure modes — guard against

{{S3 — Trap scope and routing}}

### Reasoning traps

1. {{T1 — Trace dependencies before claiming independence}}
2. {{T2 — Inspect source before relying on package behavior}}
3. {{T3 — Verify infrastructure at the owning layer}}
4. {{T4 — Verify provenance with Git}}
5. {{T5 — Diagnose tool rejection before attributing intent}}
6. {{T6 — Search the full surface before claiming absence}}
7. {{T7 — Treat reported steps as ground truth}}

### Instrument traps

{{S4 — Instrument traps introduction}}

8. {{T8 — Verify ambient environment propagation}}
9. {{T9 — Prefer standard tools over substitutes}}
10. {{T10 — Diagnose hook failures and hidden stashes}}
11. {{T11 — Preserve signal-carrying exit codes}}
12. {{T12 — Diagnose repeated infrastructure failures}}
13. {{T13 — Validate declarative artifacts natively}}
14. {{T14 — Test a live deny chokepoint}}
15. {{T15 — Reproduce under relevant runtime layers}}
16. {{T16 — Audit the probe harness itself}}

## Per-task workflow

{{S5 — Workflow scope}}

1. {{W1 — Plan agreement first}}
2. {{W2 — Implementer role}}
3. {{W3 — Two reviewer contexts}}
4. {{W4 — Synthesize reviews}}
5. {{W5 — Empirical verification}}
6. {{W6 — End-of-step sweep}}
7. {{W7 — Commit}}
8. {{W8 — Independent commit review}}

{{S6 — Implementation handoff}}

## Degraded modes — shedding order under budget/context pressure

{{S7 — Degraded modes}}

## Code review — see [CodeReview](CodeReview.md)

{{S8 — Review playbook routing}}

## Review taste — apply at write-time, not just review-time

{{S9 — ReviewTaste write-time guidance}}

## Independent validator rule

{{S10 — Independent validator}}

## Capability awareness

{{S11 — Capability awareness}}

## Memory hygiene

{{S12 — Memory hygiene}}

## Evolution

{{S13 — Evolution}}

## Communication style

{{S14 — Communication style}}
