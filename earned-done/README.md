# Earned Done

## How it works

The agent in the open session is the orchestrator: it remains accountable for the plan, acceptance, and handoff. The [role definitions](SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available) explain who does what.

```text
Artifact change
  Plan → Implement → Independent review
                   → Verify/sweep → Commit/handoff
  Needed change? Implement → review again → verify/sweep

Answer only
  Investigate → Validate → Handoff
```

These are roles and passes, not a requirement for a new agent at every box. If native delegation is unavailable or prohibited, use separate passes and disclose the weaker independence; a complete single-provider route is sufficient, with no mandatory cross-family reviewer. Missing evidence or authority is an explicit gap, not “complete.” See the [task workflow](SKILL.md#per-task-workflow) and [empirical-evidence rule](SKILL.md#core-rule-c1-empirical-verification-before-claim).
