# Review taste

## Core Philosophy

> "Why does this exist, and can it be simpler?"

Traditional code review asks: "Does this work correctly?"
This review taste asks: "Should this exist at all, and if yes, is there a fundamentally simpler way?"

Examples below are deliberately schematic and use invented identifiers. Preserve the review
question, not the sample framework or naming.

---

## Review Layers (Priority Order)

### 1. Existence Layer
**Question:** Should this code exist at all?

| Check | Question to Ask |
|-------|-----------------|
| Deletion over deprecation | Can we remove instead of marking `@deprecated`? |
| Actual consumers | Who uses this? (grep before assuming "backward compatibility") |
| Necessity | Is this solving a real problem or an imagined one? |
| Versioned subfolders | Is there really a `v2`? If not, flatten the `v1/` path. |
| Dead CSS classes | Is `className="x"` referenced in CSS / tests / selectors? If not, delete. |

**Red flags:**
- `@deprecated` comments with no migration path
- "Backward compatibility" without verified external consumers
- Code preserved "just in case"

**Example:**
```typescript
// BAD: Deprecated re-export with no external consumers
/** @deprecated Use X instead. Kept for backward compatibility */
export const oldName = newName;

// GOOD: Just delete it and update the 3 internal usages
```

**Example (vestigial version subfolder):**
```typescript
// BAD: only v1 exists; the path adds nothing
import { parseInput } from "./parser/v1";

// GOOD: flatten when you touch the component
import { parseInput } from "./parser";
```

**Example (dead className):**
```tsx
// BAD: grep finds zero style, test, or selector consumers
<button className="unused-marker" onClick={submit}>Submit</button>

// GOOD
<button onClick={submit}>Submit</button>
```

**Technique — The Deletion Test:**

Cover the function/wrapper/layer with your hand. Can callers reach the underlying thing directly with equal clarity? If yes → delete the layer.

```typescript
// BAD: Wrapper that just delegates
function createParser(config: Config): Parser {
  return new Parser(config);
}

// GOOD: Callers write `new Parser(config)` directly. Wrapper deleted.

// BAD: Method that just forwards
async ping(): Promise<boolean> {
  const result = await this.client.ping();
  return result;
}

// GOOD: return this.client.ping();  (or question if the method should exist at all)
```

---

### 2. Algorithm Layer
**Question:** Is there a fundamentally simpler approach?

| Check | Question to Ask |
|-------|-----------------|
| Step count | Why N operations when 1 works? |
| Imperative vs declarative | Can a chain of mutations become a transformation? |
| Built-in solutions | Does the language/stdlib already solve this? |

**Red flags:**
- Multiple sequential `.replace()` calls
- Manual state tracking when `.map()/.filter()/.reduce()` works
- Reimplementing what `split/join/includes` already do

**Example:**
```typescript
// BAD: imperative multi-pass normalization
str = str.replace(/\s/g, ",");
str = str.replace(/,+/g, ",");
str = str.replace(/(^,)|(,$)/g, "");

// GOOD: one declarative normalization pipeline; preserves comma/whitespace delimiters
const parts = str.trim().split(/[,\s]+/).filter(Boolean);
return parts.join(",");
```

---

### 3. Abstraction Layer
**Question:** Does each abstraction justify its existence?

| Check | Question to Ask |
|-------|-----------------|
| Similar abstractions | Why do almost-identical things exist separately? |
| Complexity budget | Does this abstraction earn its cognitive cost? |
| Premature abstraction | Is this solving a current problem or a hypothetical one? |

**Red flags:**
- Multiple regex patterns that differ by one character
- Constants that are used exactly once
- Abstractions created "for consistency" without concrete benefit

**Example:**
```typescript
// BAD: 4 regexes doing similar things
const SEARCH_SEPARATORS_REGEX = /[,\s]+/;
const SEPARATOR_DETECTION_REGEX = /[,\s]/;  // Almost identical!
const WHITESPACE_REGEX = /\s/g;
const CONSECUTIVE_SEPARATORS_REGEX = /,+/g;

// GOOD: 1 regex, split handles the rest
export const SEARCH_SEPARATORS_REGEX = /[,\s]+/;
```

**Semantic surface / contract readability:**

At a non-trivial public, cross-component, state, or lifecycle boundary, callers should not have to
reconstruct the contract from the implementation. Use the strongest native mechanism available:
honest signatures and named domain types in typed code; explicit named/tagged values, schemas, or
concise contract documentation in dynamic code. Make every contractually meaningful outcome
visible — including absence, pending states, terminal variants, and caller-actionable failures.
Describe failures through the boundary's real idiomatic channel (exceptions or rejections,
result/tagged values, protocol statuses, or events), not through a documented normalized channel
the implementation does not provide.

Document the non-obvious contract: ownership, lifecycle, invariants, recovery/failure
responsibilities, concurrency, and surprising asymmetry when relevant. Comments explain *why* the
code has its shape; they do not narrate the body. This is a boundary rule, not a docstring quota:
locally obvious private helpers need neither ceremonial documentation nor a separate architecture
document.

Documentation cannot repay needless abstraction cost. Apply the Deletion Test and simplify first;
then document the necessary contract that remains.

**Flag-overloaded callbacks:**

A boolean parameter switching between behaviors is an invisible contract — the caller must remember what `true` and `false` mean.

```typescript
// BAD: one callback, two behaviors via flag
complete: (keepOpen?: boolean) => void

onClick={() => complete(true)} // what does true mean here?
keyboard shortcut → complete() // omitted flag silently selects another behavior

// GOOD: split into named callbacks
onComplete: () => void
onCompleteAndContinue: () => void
```

Symptom: two callers that appear to perform the same action diverge because one bypasses the
flag-routing wrapper.

**Framework slot vs hand-built equivalent:**

When the framework exposes a slot for what you're recreating, use the slot. Manual reconstruction loses framework defaults (a11y attributes, test IDs, focus management, animation timing).

```tsx
// BAD: rebuilds what the framework provides
<Panel open={open} onClose={onClose}>
  <Panel.Header>Notice</Panel.Header>
</Panel>

// GOOD: framework owns the title slot
<Panel open={open} onClose={onClose} title="Notice" />
```

**Render gate over controlled visibility:**

```tsx
// BAD: two gates, breaks framework exit animation
{isOpen && <Panel open={true}>...</Panel>}

// GOOD
<Panel open={isOpen}>...</Panel>
```

---

### 4. Consistency Layer
**Question:** Why is the same problem solved differently in different places?

| Check | Question to Ask |
|-------|-----------------|
| Parallel implementations | Same logic in multiple places = unification opportunity |
| Different approaches | Same task solved differently = architectural smell |
| Shared utilities | Can common logic be extracted? |

**Red flags:**
- Copy-pasted logic with slight variations
- Same problem solved via API in one place, client-side in another, without clear reason
- Similar functions in different modules that could share a base

**Example:**
```typescript
// BAD: Same split logic in two places
// File A:
const parts = input.split(/[,\s]+/).filter(Boolean);
// File B:
const terms = rawInput.split(SEARCH_SEPARATORS_REGEX).map(t => t.trim()).filter(Boolean);

// GOOD: Shared utility
export const parseSearchTerms = (input: string): string[] =>
  input.trim().split(SEARCH_SEPARATORS_REGEX).filter(Boolean);
```

**Functional Overlap — when grep can't help:**

Code overlap catches similar-looking code. *Functional overlap* is different code serving the same
purpose: two implementations of one job, invisible to text search. When a new mechanism is
introduced, remove the old one or migrate its callers. Two paths for one operation drift.

```typescript
// BAD: same formatter; output style is the only difference
const makeCompactFormatter = (...)
const makeDetailedFormatter = (...)

// GOOD: One factory with the axis of variation as a parameter
const makeFormatter = (style: "compact" | "detailed", ...)
```

**Wrapper smell:** if a new abstraction is instantiated only to wrap old data and then discarded,
the migration is cosmetic. Real migration means the new abstraction *owns* the lifecycle.

**Partial idiom reuse — half a copy is a hidden inconsistency.**

When a canonical function already produces the representation or reconciliation you need, reuse it
whole. Copying only its input filter, but not its output transform, can look right on one path and
break another. It is worse than an obvious duplicate because it type-checks and one caller may mask
the other's bug.

```typescript
// BAD: copied the eligibility step but skipped canonicalization
const keys = candidates.filter(isUsable).map(item => item.rawKey);

// GOOD: run through the whole canonical idiom
const keys = canonicalize(candidates).map(item => item.key);
```

**Red flag:** a comment says *"matching X"* / *"as in X"*, but X does more than one step and only
one was copied. Reuse the function, don't paraphrase it, and verify X actually behaves as the
comment claims by checking the reference's behavior rather than its description.

**Decision rule — Extend vs Accept:**

The percentages below are a qualitative overlap heuristic, not a measured coverage score. Use them
to force an explicit judgment about shared behavior; do not manufacture precision from line counts.

| Overlap | Action |
|---------|--------|
| >80%    | Extend existing (obvious duplicate) |
| 60–80%  | Extend existing — default. Critical zone where pain compounds. |
| 50–60%  | Judgment: shared *core* logic → extend; incidental structural similarity → accept. |
| <50%    | Accept — different domains. |

In a single codebase, duplication cost compounds (bugs fixed in one but not the other, behaviour drift, "which one should I use?"). Modification cost is one-time and bounded. **Default: extend.**

**Not every divergence is a bug — protect the intentional ones.**

Two branches sometimes differ *on purpose* because they mirror different real references. Guard
that asymmetry with a comment stating the rationale **and** a test name that pins the intent.
Otherwise a reviewer may "unify for consistency" and reintroduce the original bug.

```
// New events      → START of a newest-first feed
// Imported events → END to preserve archive order
```

A reviewer may flag the different insertion points as inconsistent. The rationale and tests should
show whether the asymmetry preserves two real ordering contracts or is accidental drift.

**Red flag:** before aligning two branches "for consistency", check whether the difference preserves
different references or semantics. If so, it needs a guard, not a merge. Consistency is with the
correct reference, which may be path-dependent, not necessarily between sibling branches.

**Test selector alignment with layer:**

Different test layers have different selector contracts. Crossing them silently breaks things.

| Layer | Selector strategy | Why |
|---|---|---|
| Component test | role or visible text | observable API; survives refactors |
| Browser E2E | dedicated test identifier | stable automation contract; survives label changes |

```typescript
// BAD: component test coupled to an E2E-only identifier
expect(getByTestId("confirm-action")).toBeInTheDocument();
// GOOD
expect(getByRole("button", { name: /confirm/i })).toBeInTheDocument();
```

```typescript
// BAD: browser test tied to copy that may be localized
await page.getByText("Confirm").click();
// GOOD: explicit E2E contract
await page.getByTestId("confirm-action").click();
```

**Avoid redundant selector qualifiers:** if a test identifier is unique, do not also pin its tag or
DOM ancestry.

---

### 5. Edge Case Layer
**Question:** What inputs break this?

| Check | Input Type |
|-------|------------|
| Empty | `""` |
| Whitespace only | `"   "` |
| Separators only | `",,,;"` |
| Single item | `"one"` |
| Boundaries | Max length, special characters |

**Red flags:**
- No tests for empty/null/undefined inputs
- Assumptions about input format without validation
- Different behavior for edge cases vs normal cases without clear intent

**Example:**
```typescript
// Question: What does this return?
parseTerms(",,,") // [] — is empty output valid here?
```

**I/O failure paths, not just bad inputs.** For every I/O boundary the diff touches, trace the
non-happy path — error status, rejection, timeout, malformed payload — to the resulting state, as
a standing lens, not an end-of-review afterthought. Trace success-shaped failures too: an error
encoded as HTTP 200 can bypass a status guard and trigger destructive handling of healthy state.

---

### 6. Conciseness Layer
**Question:** Can this be expressed in fewer lines without losing clarity?

| Check | Question to Ask |
|-------|-----------------|
| Test verbosity | Can repetitive tests become table-driven? |
| Boilerplate | Is ceremony adding value or noise? |
| Line count | 180 lines vs 30 lines for same coverage? |

**Red flags:**
- Copy-pasted test structure with only values changing
- Multiple `it()` blocks that could be `test.each()`
- Verbose setup that obscures the actual test

**Example:**
```typescript
// BAD: 180 lines of repetitive tests
it("should split by comma", () => {
  expect("a,b".split(REGEX)).toEqual(["a", "b"]);
});
it("should split by semicolon", () => {
  expect("a;b".split(REGEX)).toEqual(["a", "b"]);
});
// ... 20 more identical structures

// GOOD: 30 lines with table-driven tests
const cases = [
  ["a,b", ["a", "b"], "comma"],
  ["a;b", ["a", "b"], "semicolon"],
  ["a b", ["a", "b"], "space"],
] as const;

test.each(cases)('splits "%s" → %j (%s)', (input, expected) => {
  expect(input.split(REGEX)).toEqual(expected);
});
```

---

## Anti-Patterns Quick Reference

| Anti-Pattern | Review response |
|--------------|------------------|
| `@deprecated` with no consumers | Delete it |
| Multiple similar regexes | Consolidate to one |
| `replace().replace().replace()` | Use one declarative `split().filter().join()` pipeline |
| 180-line verbose tests | Table-driven in 30 lines |
| "Backward compatibility" | Prove consumers exist first |
| Same logic, different files | Extract shared utility |
| Different solutions, same problem | Question why, then unify |
| Copied half a canonical idiom (filter but not transform) | Reuse the whole function; verify the reference's real behavior |
| Divergent sibling branches | Check if the asymmetry is intentional before unifying; if so, guard it (comment + test name) |
| Wrapper that just delegates | Delete the wrapper — apply the Deletion Test |
| Two factories for one job | Parameterize the axis of variation |
| `v1/` subfolder with no v2 | Flatten — versioning is vestigial |
| `className="x"` with zero references | Delete the class attribute |
| `complete: (keepOpen?: boolean) => void` | Split the behaviors into named callbacks |
| External render gate around controlled visibility | Let the component's visibility prop own it |
| Hand-built title markup when a title slot exists | Use the framework slot |
| Component test asserts on an E2E identifier | Query by role or visible behavior |
| Browser E2E selector uses translatable text | Use a dedicated test identifier |
| Unique test identifier plus tag/ancestry | Drop the redundant qualifiers |

---

## Review Checklist

Before approving a PR, ask:

- [ ] **Existence:** Can anything be deleted instead of added/modified?
- [ ] **Algorithm:** Is there a simpler fundamental approach?
- [ ] **Abstraction:** Does every new abstraction justify its cost?
- [ ] **Contract:** Can callers see meaningful outcomes and non-obvious responsibility without reading the implementation?
- [ ] **Consistency:** Is the same problem solved the same way everywhere?
- [ ] **Edge cases:** What happens with empty/null/boundary inputs?
- [ ] **Conciseness:** Can tests be table-driven? Can code be terser?

---

## The simplicity test

> If you can ask "why not just X?" where X is simpler, the code needs revision.

Examples:
- "Why not just delete it?" → Better than deprecation
- "Why not just split?" → Better than 3 replaces
- "Why not just one regex?" → Better than 4 similar ones
- "Why not table tests?" → Better than 20 copy-pasted `it()` blocks
- "Why not delete this wrapper?" → Better than indirection that adds no behaviour
- "Why not one factory with a parameter?" → Better than two cousin factories
- "Why not flatten the version subfolder?" → Better than vestigial path indirection
- "Why not split the callback into two named ones?" → Better than a flag parameter that re-routes behaviour
- "Why not the framework's slot?" → Better than reconstructing what the framework already does
- "Why not a dedicated test identifier?" → Better than translatable text in browser E2E tests
- "Why not just the unique identifier?" → Better than pinning tag and DOM ancestry too
- "Why not reuse the whole function?" → Better than copying half its idiom and diverging on one path
- "Why treat this asymmetry as a bug before checking it's intentional?" → Some divergence is load-bearing; guard it, don't unify it
