---
name: mental-map
description: Build a verified mental model of a codebase, mechanism, paper, or concept through source-grounded explanation and interactive checks of the user's retellings. Use for onboarding or understanding how something works; not for routine one-shot explanations or bug analysis.
---

# Mental-map — a verified mental model of a topic

The deliverable is the user's verified mental model, broad first and deep on demand, not a
document. The spine — ground → map → zoom → retelling checks → gap map and resume hook — applies to
any target worth understanding: a codebase, module, subsystem, mechanism, file, pull request, paper,
or concept. Codebases are the most developed mode below. Work read-only with respect to the
subject's implementation and data: bugs and cleanup ideas go on the exit map as follow-up
candidates, and fixing them is a separate task. The only persistence exception is a learning-note
target whose location and scope were explicitly authorized already; it must not modify the
implementation or data being inspected. One agent owns the dialogue. A standalone invocation is
solo. An outer orchestrator may supply an already-planned independent examiner, who grades
privately and never takes over the loop.

Here, **verified** means a user's current retelling was checked against sources read in this
session; it does not measure retention or mastery.

## Choosing the opening

- Project or module → start with the **Map**; zoom in on demand. A cross-cutting subsystem is a
  scoped map, not a mechanism zoom.
- Single mechanism, file, or single-mechanism pull request → enter the **Zoom layers** directly. A
  large multi-file pull request gets a scoped map first, showing the areas it touches.
- Paper or concept → map its key claims, argument structure, and one worked example.
- If asked to check the user's understanding, have them state their model first, then verify it
  piece by piece.
- If the caller supplies an already-authorized resume record and its target matches or is adjacent,
  begin by re-checking its shaky items. No such record is normal.
- If no target is supplied, ask for one or offer two or three candidates from recent context, such
  as the last deep-dive, a recent pull request, or the module just discussed.

Ground comes first in every opening: read the sources before explaining or verifying anything.

## Ground rule — read the source before explaining

- Before the first explanation, read the topic's primary sources: for code, the actual source and
  its callers or consumers; for a paper or concept, the text itself, specification, or primary
  documentation. Fetch canonical remote sources when reachable. If one is unreachable, say so
  plainly rather than explaining from memory. When a concept is embodied in a library or codebase,
  ground it in that source and its in-repository usage.
- Never explain code from a diff alone; read the actual source and its callers or consumers.
- If no source is available, scope the session to what can be grounded.
- Each confirmation or correction of a user's retelling must rest on a source read in this session
  and cite it: `file:line` for code, section or page for texts. Without a citation, do not assert it.
- Explicitly mark inferred versus verified details. An unverified detail must not pass as fact just
  because it seems plausible.
- If a question hinges on behavior you have not verified and a probe is inexpensive, run it in a
  scratch directory created with `mktemp -d` and absolute paths. Do not put probes in the working
  tree.

## Map first — parts, dependencies, and one trunk flow

For any topic, map its component parts, their dependencies, and one end-to-end trunk flow. Check
the map itself before zooming: have the user retell the shape — layers, callers, and dependencies —
then verify it as you would any paraphrase. Continue with progressive zoom as long as it helps.

**Codebase mode** — the most developed:

1. **Breadth-scan before depth** — orient with manifests and dependencies, entry points, directory
   structure, and existing repository instructions. Find the active guide for the current runtime;
   do not assume a particular provider-specific filename. Then read individual files.
2. **Tour stops** — identify roughly 10–20 important files or modules, each with one line about why
   it matters: entry points, configuration hubs, core state, or risky areas. Keep the map
   lightweight; precise `file:line` citations belong to zoom mode.
3. **Data-flow sketch** — trace one request or data point through the actual files it passes
   through. Read the handful of files on that path deliberately so the trace is source-verified.

**Paper or concept mode** — identify key claims and definitions, show how the argument's parts
depend on one another, and carry one example through from start to finish.

## Zoom layers

Work through these in order. The default pace is one layer, or a coherent pair, per turn, ending
with a check-move. A complete multi-layer walkthrough is appropriate when explicitly requested;
the problem is not depth but delivering an unrequested wall of text. Begin the retelling loop with
the user's first reaction, question, or pushback.

1. **Contract / what it is** — purpose, users, and what can be relied on.
2. **Mechanics through one concrete example** — trace a call, event, interaction, or computation
   with real values. For example, show which records are in a queue before and after an operation.
   A trace is better than an abstract description; if you cannot produce one, read more first.
3. **Existence / why this shape** — why the abstraction exists. Sketch a simpler alternative and
   assess honestly whether the current design is justified, overly general, or historical.
4. **Boundaries** — where the model stops applying or what it intentionally ignores: concept
   limitations, or code edge cases and adjacent pre-existing debt. Label existing issues as
   pre-existing so they are not attributed to the wrong change.

## Retelling loop — the heart

Choose between two moves based on the dialogue:

- **Paraphrase check** — the user explains it in their own words. Treat that explanation as a set
  of claims and verify each against the source.
- **Grill** — when no paraphrase is forthcoming, ask one question at a time, increasing depth:
  contract → mechanics (what happens on the next call?) → why this design? → edge case → transfer
  (where else could the same issue matter?). Verify the answer before going deeper.

**Turn-yield.** A check-move — inviting a paraphrase or asking a grill question — ends your turn.
Wait for the answer; do not answer your own question or continue to the next layer in the same
message. The user's reply is part of the work.

**Question-quality gate.** Before asking a check question, identify silently: the claim or mechanism
it tests, the evidence a correct answer should contain, and a plausible misunderstanding a wrong
answer might reveal. If it cannot distinguish understanding from guessing, repeated wording, or a
bare “yes,” use a concrete reconstruction, prediction, trace, or explanation instead. Name the
object, operation, reference set, or stage needed to make the question clear. Avoid vague references
such as “it,” “zero,” or “the value.” Use only terms already grounded in the dialogue. Do not give
away the answer with a forced choice that merely repeats the prior explanation. If the user cannot
tell what an answer should look like, own the ambiguity, restate the question with one concrete
example, and check the same mechanism again. A short answer passes only if it supplies the
identified evidence; otherwise ask for the missing mechanics without implying that agreement
demonstrated understanding.

- **Explore instead of asking** — read the source to answer factual questions; do not outsource
  research to the user. Questions test understanding.
- **Route vs. check questions** — when asking where to go next, offer a recommended topic. A check
  question should not hint at its answer.
- **Emptiness detector** — if a mechanics retelling only restates the contract, mechanics are not
  understood yet. Focus there.
- **One-sentence distillation** — close each zoomed topic and the whole map by asking the user to
  summarize it in one sentence. A vague sentence means it is not yet distilled.

**Never rubber-stamp, and never invent.** A paraphrase can sound right while containing a subtle
error, so actively check it. Do not assume that a plausible paraphrase usually has one. If your
source-based check finds no error, say plainly that the explanation is correct and state where its
boundary lies instead of manufacturing a nitpick. Useful imprecision classes to check include:

- **Units or arithmetic** — confusing multiplication with addition, or counting the wrong thing.
- **Sharing** — describing a shared collection as separate per-item collections.
- **Causality direction** — who resolves or wakes whom, and what triggers what.
- **Object confusion** — confusing a queue of requests with a separate record of completion
  signals.
- **Conditionality** — calling an operation a harmless no-op when that is true only because current
  callers pass fresh or empty arguments. State the condition, not just the verdict.

On an important retelling, remember that your own check shares assumptions with your explanation.
A standalone `mental-map` session never creates, requests, or routes an examiner. If an outer
orchestrator already supplied an independent examiner, that examiner may privately check the same
sources and retelling without taking over the dialogue. The examiner's provider is irrelevant; if
no slot was supplied, do not create a setup step or dependency.

Analogies are welcome, but test them against the mechanics before endorsing them. If the analogy
breaks under a concrete case, trace the behavior directly. Calibrate depth to the user's questions
and follow their thread; abandon a planned curriculum when a question exposes a more important gap.

When correcting, first confirm what is right, then identify the corrections. Explain each correction
with the mechanics and a source citation, not denser jargon.

## Exit — gap map and resume hook

Close with a short map in three buckets:

- **Confirmed** — claims the user now states correctly, in their words.
- **Still shaky** — corrected misunderstandings (one-line accurate version each) and unanswered or
  unverified questions.
- **Follow-ups** — pre-existing debt, cleanup ideas, or ticket candidates that surfaced. List them;
  do not fix them during the session.

**No silent durable write.** By default, return a compact resume hook in the final handoff: date,
target, mode, condensed confirmed and shaky items, follow-ups, and the next re-check. Persist it
only when the caller has already approved the specific target and scope. Name that target in the
handoff and append only there, never inside an installed skill. This is the sole exception to the
read-only subject boundary and must not modify the inspected implementation or data. Write a full
map document only on explicit request and to a location the user names or the project's documented
convention. Without an authorized target, the map remains in the user's head and the resume hook is
only in the handoff.

## Anti-patterns

- Delivering a wall of text by default or advancing past a check-move without waiting for the
  answer. (An explicitly requested full walkthrough is fine.)
- Rubber-stamping a paraphrase without checking it, or inventing a subtle error just to find one.
- Empty praise or generic questions unrelated to the user's last answer.
- Trivia questions about names, line numbers, or API spelling instead of mechanics.
- Correcting with jargon instead of a trace.
- Confirming from memory what you did not read in this session.
- Turning the map into a polished document without authorization; durable notes need an approved
  target.
- Trusting an old map instead of re-reading the live source. Resume records are reminders, not
  ground truth.
- Editing the subject during an understanding session; implementation changes are separate work.
