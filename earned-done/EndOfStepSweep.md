# End-of-step sweep — hunt for tails

Run this before claiming a step done ([W6](SKILL.md#per-task-workflow) points here).

Incremental refactors leak dead code. A consumer changes, but the old producer remains because its
own tests still reference it or the type checker stays green. A parallel near-duplicate helper can
survive for the same reason. Both should be swept before the step closes.

Before claiming a step done, run these checks:

1. **Grep for what this step replaced.** If callers moved from `oldFoo` to `newFoo`, search
   `oldFoo` across the repository. Survivors fall into:
   - Test files only → rewrite tests against `newFoo` or delete them. Do not preserve a producer
     only to satisfy its own tests.
   - Comments / doc strings → update to reflect current truth.
   - Other production code → either was missed (fix now) or there's a real reason (document it in code, not just in chat).
2. **Near-duplicate sweep.** If a new function has the same shape as an existing one but differs by
   one parameter, ask why it is not one parametrized function. Apply
   [ReviewTaste's Abstraction Layer](ReviewTaste.md#3-abstraction-layer) while writing; it is cheaper
   than later rework.
3. **At the end of a multi-step refactor, pause and ask:** "Did this work leave anything obsolete?"
   Search the whole flow, not only the latest diff. Cumulative steps can kill a producer that no
   single diff makes obviously dead.

Once per change, run a comment pass. Delete narration, duplicates away from the decision site, and
ticket-number tokens. Verify that no essential contract comment was lost, using a keeper list or
loss-check lens.

The sweep produces either "zero hits, ship" or "cleanup before ship". Skipping it creates
review-visible technical debt.
If this sweep authors any source or artifact cleanup after [W5](SKILL.md#per-task-workflow), route
the change through [W2](SKILL.md#per-task-workflow), freeze it, repeat a proportional
[W3](SKILL.md#per-task-workflow), and repeat [W5](SKILL.md#per-task-workflow) before
[W7](SKILL.md#per-task-workflow). No
post-verification mutation reaches commit.
