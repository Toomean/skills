export default (rules) => `# Outcome-first model routing

## 1. What are we optimizing for?

${rules["MR1 — Routing scope"]}

${rules["MR2 — Completion and cost objective"]}

## 2. Who should do the work?

${rules["MR3 — Sole controller"]}

${rules["MR4 — Complete provider route and roles"]}

${rules["MR5 — Pre-route evidence and resource check"]}

${rules["MR6 — Route by task fit"]}

## 3. How do we protect capacity and independence?

${rules["MR9 — Shared-pool cap and checkpoint"]}

${rules["MR10 — Role packets and safe resume"]}

## 4. What follows from each wave?

${rules["MR7 — Failed-wave branches"]}

${rules["MR8 — Optional classifier threshold"]}

## 5. What do we record throughout the task?

${rules["MR11 — Routing note"]}

${rules["MR12 — Conditional comparison ledger"]}
`;
