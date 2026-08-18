# Code review — playbook

How to RUN a review (PR review or review-fix). [ReviewTaste](ReviewTaste.md) is the taste layer —
what to look for; this file is the process layer. The core rules —
[independent roles and delegation](SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available),
[empirical verification](SKILL.md#core-rule-c1-empirical-verification-before-claim), and the
[independent validator](SKILL.md#independent-validator-rule) — still govern; this playbook sharpens
them for review work.

## Keep the four axes separate

| Axis | Question it answers | Examples | Owner |
| --- | --- | --- | --- |
| Workflow role | Who produces or decides? | orchestrator, implementer, reviewer, investigator | [core protocol](SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available) |
| Review purpose | What is this reviewer trying to learn? | static discovery, empirical adjudication | this playbook |
| Review evidence mode | How can this reviewer close claims? | `review-mode=empirical`, `review-mode=split`, `review-mode=static` | step 0 below |
| Reviewer primary emphasis | What independent question should this reviewer search first? | correctness, robustness, simplicity, dissent | assignment prompt |

Choose each axis independently. A static reviewer is a review purpose, not a statement about tool
access. A primary emphasis widens the search; it does not change the reviewer's workflow role or
evidence mode.

## Reviewer purposes

Give every reviewer the same minimal correctness/evidence baseline and permission to report any
material defect it notices. Treat the named purpose as its primary objective, not as a filter that
suppresses useful findings outside that objective. Here `static` and `empirical` describe the
intended review pass; the separate `review-mode=...` label records its proven evidence capability.

- **Static reviewer — discovery.** Map the diff, contracts, history, writers/readers, blast radius,
  and missing cases with the least privilege and a context independent from the implementer. It may
  produce source-grounded findings and behavior candidates with verification recipes, but it does
  not turn an unexecuted runtime claim into a verdict. Static review is a deliberate breadth lens,
  not a failed empirical review.
- **Empirical reviewer — adjudication.** Challenge and close load-bearing behavior/correctness
  claims with red repros, targeted mutations, and harness controls. Use it when a runtime claim must
  enter the final verdict; step 0 must select an evidence mode that can complete the empirical loop.

An investigator receives no review purpose unless it is explicitly promoted to reviewer; its
orientation-only workflow role is defined by
[C2](SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available).

The same reviewer may move from discovery to adjudication only after the step-0 evidence gate passes;
changing its prompt does not change its capabilities.

## Optional native different-family reviewer

A single-provider lineup is normal and complete. When the plan already contains a read-only reviewer
slot and the current harness natively exposes an already-authorized different-family subagent for
this project and task, fill one such slot with that subagent. Never increase reviewer count, waves,
or fan-out solely for family diversity. Give it a frozen artifact, one primary emphasis, and an
evidence request. The harness owns invocation, account, billing, and access. Do not inspect
credentials, discover providers, build a route, or ask the user to configure one from inside this
playbook.

If that subagent is absent or unavailable, fill the same slot with an independent same-provider
context; the absence alone is not a degradation to report, and the optional lane never blocks
completion. Treat every returned finding as an untrusted candidate bound
to artifact revision, question, and cited evidence. Family diversity complements, never replaces,
empirical verification. Do not ask reviewers to judge or praise one another's novelty; the
orchestrator validates findings first, then records overlap and incremental coverage.

## Order of operations

**0. Select the review evidence mode before assigning empirical work.** Every exec-capable reviewer runs
side-effecting commands only outside the ambient/live checkout. Start with an absolute `mktemp -d`
root per [C2](SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available): use it directly (`git -C`) for generic experiments, or create a disposable
per-reviewer worktree beneath that validated temp root with its OWN dependency install for project
empirics. Before the reviewer prompt, the provisioner records a task-specific evidence gate:
- **Baseline:** the copy contains the exact review SHA/diff; dependencies resolve from that copy,
  not by walking up into the parent checkout.
- **Execution:** a trivial shell command AND the real affected test selector execute; the selector
  includes at least one known-green test, so an empty selection is not a pass.
- **Mutation boundary:** a scratch source/test edit inside the copy succeeds; a write to the live
  tree or shared git metadata is denied when a sandbox wall is part of the safety claim.
- **Inputs:** required fixtures/services/secrets and enough budget for the named repro are present.

Record exactly one reviewer evidence mode; never infer it from the model, family, or review purpose:

| Review evidence mode | Gate result | Required action |
| --- | --- | --- |
| **`review-mode=empirical`** | The reviewer can author, mutate, execute, and adjudicate in its disposable copy. | Let that reviewer close the empirical claim. |
| **`review-mode=split`** | Safe authoring works, but execution does not. | The reviewer authors the repro or mutation; a named capable executor returns raw commands/output; the reviewer then adjudicates. |
| **`review-mode=static`** | Safe authoring or required inputs are unavailable. | Return a static candidate plus an exact verification recipe and route it to a capable verifier. |

A failed gate is an infrastructure/capability result, never evidence about the code. Re-provision,
use the split author→executor→adjudicator loop, or hand off; do not turn it into a green review and
do not suppress the static risk. Product/test mutations stay inside the disposable copy. One copy
per reviewer prevents cross-reviewer conflicts. Destructive repros and mutations remain in those
disposable copies; after checking branch and workspace state, the orchestrator runs the full final
gate once in the active integration tree, and that run is the acceptance evidence.
Provider-specific cause labels require their exact provider evidence; a provider diagnosis never
replaces the step-0 gate.
Rationale and incident history: [C2](SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available)
owns "exec-agents don't touch the live tree" (single
source of truth). After such an agent returns, `git status` + `git log` +
`git config --get core.hooksPath` before trusting any run.

1. **Branch/state first.** Before any green/red run: `git branch --show-current` + confirm the
   change under review is actually in the tree (`git diff`/`git status`). The ambient checkout ≠
   the branch under review. A green run on a different branch, or with zero selected tests, is not
   evidence about the change.

2. **Run the affected area's EXISTING suite early.** A red existing test is caught in one run and
   outweighs analytical speculation. Before code-complete, run the project's full gate
   once in the active integration tree. A "full" claim names the runner and known excluded
   suites/scripts; exercise affected exclusions or record them as residuals.

3. **Blast radius & evidence census — before drafting.** Census what evidence is reachable for
   the change: the counterpart of every cross-boundary contract the diff touches (a backend, a
   consuming app, a shared lib — is a checkout already in the workspace?), plus CI, fixtures,
   live/test envs, specs. Where the diff changes a contract, the draft is not complete until you
   have READ (not merely named) the load-bearing counterpart — the consumer or data source the
   finding actually rests on — even across a repo/service boundary. A counterpart that is
   genuinely unreachable defines, by construction, a finding that ships only as an explicit
   contract question WITH a verification recipe — flag it as such from the start. For a GitHub PR
   with an available authenticated CLI, the census's "CI" item includes one early `gh pr checks`
   glance, not only step 10. On another forge, use its native CI surface; when no CI surface is
   reachable, record that limitation instead of manufacturing a green signal. A red check
   concentrated on the touched feature is evidence that changes severity and reviewer prompts.
   Step 10's pre-delivery self-check stays.

4. **Draft findings INDEPENDENTLY — do not read existing PR threads first.** Reading bot/human
   reviews before drafting anchors mine and turns it into a second opinion. The deliverable is a coherent standalone
   comment, not thread-weaving. Independent duplication of someone's finding *with stronger
   evidence* (my red repro vs a bot's static claim) is a feature, not a defect.

5. **No load-bearing behavior/correctness finding ships as a verdict without executed evidence.**
   This is a delivery gate, not a demand that the originating reviewer personally execute. A
   reviewer in split or static mode hands the candidate across step 0's loop; until execution it
   may appear only as an explicit open question with `evidence=static`, the blocking limitation,
   and a verification recipe — never as a severity verdict or approval rationale. Algebra and
   agent agreement do not count. Match the empiric to the claim:
   - behavior defect → a red repro on the reviewed tree;
   - claimed fix or regression guard → green → revert/mutate the mechanism → expected test red →
     restore → green;
   - test-coverage finding → a targeted mutation that survives the cited tests (otherwise it is a
     static coverage guess);
   - inherited/pre-existing mechanism → step 6's zero-PR control;
   - deny/security boundary → [T14](SKILL.md#instrument-traps)'s live positive control plus the
     adjudicator's own evidence.
   Record mode, exact command, selected-test count, exit status, expected/observed result, and the
   mutation/control used. These controls are what distinguish a plausible explanation from a
   review finding.

6. **"Pre-existing" classification needs a CONTROL repro.** If a finding is filed as inherited
   ("the mechanism predates this PR"), run the same repro with ZERO PR code (e.g. the plain
   setter instead of the new entry point). Reproduces identically → "pre-existing" is proven, not
   argued.

7. **A finding that rests on a state field → enumerate ALL writers of that field.** One grep for
   the setter, list every write site, ask what each one does to the finding. A writer census often
   reveals hidden UI and initialization side effects — cheap grep, high yield.
   The dual for restored/migrated state: a fix that makes previously-unreachable persisted state
   reachable again is not reviewed until that state's READERS are enumerated down to the actual
   consumption/render path — the code that ultimately reads it — and one degraded-data scenario
   is driven through that real path, not a store-level getter. A comment naming X "the render
   path" / "the consumer" is a claim to trace, not a fact (an external bot caught a restore-crash
   all review arms missed by starting from the state's consumers; our own test asserted a getter
   no render code used).
   When documentation is canonical for state or lifecycle behavior, census every writer,
   transition, and terminal path — not only the happy-path trace — then check its types and prose
   against that census. A clean signature or convincing state diagram is not evidence that an
   omitted reachable outcome does not exist.

8. **Antithesis pass — the independent validator against the DRAFT, not just the diff.** Once draft
   findings exist (steps 4-7), use the protocol's skeptical validator pass with two explicit mandates:
   (a) **refute** — attack each draft finding from a default-refute stance; a finding that
   survives a genuine refutation attempt ships, one that dies is dropped or downgraded before the
   user ever sees it; (b) **complete** — hunt what the draft MISSED: side effects of the touched
   state, imprecise mechanisms, unstated assumptions. Candidates from (b) enter the normal
   evidence pipeline (steps 5-7) before shipping — a candidate labeled "suspicion" is never
   dropped silently: run the cheap check (grep the notes/spec) or ship it as an explicitly-open
   question. Do not silently drop a cheap-to-check suspicion.
   The validator must be independent from the draft author. It may occupy one of [W3's two default
   reviewer contexts](SKILL.md#per-task-workflow); antithesis does not automatically add a context or
   wave. Add one only when required independence or expertise cannot fit an existing slot, and name
   why. Use a distinct skeptical lens, not N identical refuters
   ([consensus is not verification](SKILL.md#independent-validator-rule)). Distinct
   from the empirical verifier of step 5: the verifier confirms NAMED claims, while antithesis
   hunts UNNAMED ones. They are not substitutes.

9. **Cross-PR / interaction findings: decompose, don't collapse into "conflict".** Separate
   (a) git-level (textual conflict?), (b) semantics (what breaks after a clean merge?),
   (c) caught-by-test vs silent, (d) blocker-of-ordering vs reconcile-at-rebase. A clean rebase
   with a test-caught one-line reconcile is not a merge blocker. "Needs coordination" ≠ "blocker".

10. **Pre-post pass** (after the draft, before delivering):
   - **Thread skim, one purpose only:** strike from the draft anything the author already answered
     in existing threads. Nothing else about the draft changes — independence stays intact.
   - **CI self-check, not review content:** one glance at the PR's checks — "could any red check
     plausibly be caused by this diff?" If yes → investigate before delivering. If no → stay
     silent about CI; "rebase / re-run stale CI" advice is process noise the merge gate enforces
     anyway.

## Delivery

- Verdict first (`approve` / `approve-with-suggestions` / `blockers` / `no verdict — material
  evidence open`), then severity-ranked findings. Use `no verdict` when a material claim remains
  static or unreachable; open evidence is neither a blocker verdict nor approval rationale. Then list findings,
  each with file:line and its evidence type (executed repro > static trace).
- **A recommended remedy meets the same evidence bar as a finding.** Trace the fix against the
  *realistic* failure shape — what the failing system actually returns, which may be
  success-shaped (an error rendered as HTTP 200 defeats a `response.ok` guard) — not only against
  the repro that demonstrated the bug.
- When the ticket has explicit acceptance criteria: a per-AC verdict table (PASS/FAIL + evidence)
  — cheap and makes the requirements coverage auditable.
- Don't number findings "#N" in GitHub comments (autolinks to PRs/issues) — use "item N".
- Posting to GitHub (comments, approve, request-changes) needs explicit per-action approval from
  the user; default delivery is the in-session report.
