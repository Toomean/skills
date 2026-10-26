const token = /\{\{([^{}]*)\}\}/gu;
const keyPattern = /^([A-Z][A-Z0-9]*[0-9]+) — (.+)$/u;

export function render(template, catalogue) {
  if (typeof template !== "string") throw new Error("Template must be a string");
  if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) {
    throw new Error("Catalogue must be an object");
  }

  const keysById = new Map();
  for (const [key, body] of Object.entries(catalogue)) {
    const match = keyPattern.exec(key);
    if (!match) throw new Error(`Malformed catalogue key: ${key}`);
    const [, id] = match;
    if (keysById.has(id)) throw new Error(`Duplicate catalogue ID: ${id}`);
    if (typeof body !== "string" || body.trim() === "") {
      throw new Error(`Empty catalogue value: ${key}`);
    }
    keysById.set(id, key);
  }

  const references = new Map();
  const rendered = template.replace(token, (_whole, key) => {
    const match = keyPattern.exec(key);
    if (!match) throw new Error(`Malformed template reference: ${key}`);
    const [, id] = match;
    const expected = keysById.get(id);
    if (!expected) throw new Error(`Unknown template reference: ${key}`);
    if (expected !== key) throw new Error(`Stale template reference: ${key}; expected ${expected}`);
    references.set(id, (references.get(id) ?? 0) + 1);
    return catalogue[key];
  });

  if (/\{\{|\}\}/u.test(rendered)) throw new Error("Malformed or unresolved template token");
  const scaffold = template.replace(token, "");
  const lines = scaffold.split(/\r?\n/u);
  let inFrontmatter = false;
  let frontmatterClosed = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (index === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") {
        inFrontmatter = false;
        frontmatterClosed = true;
      }
      continue;
    }
    if (
      trimmed &&
      !/^#{1,6} .+$/u.test(trimmed) &&
      !/^\d+\.\s*$/u.test(trimmed) &&
      !/^Protocol revision: \d{4}-\d{2}-\d{2}-r\d{3}\.$/u.test(trimmed)
    ) {
      throw new Error(`Literal prose outside catalogue values: ${trimmed}`);
    }
  }
  if (inFrontmatter || (lines[0]?.trim() === "---" && !frontmatterClosed)) {
    throw new Error("Unclosed initial YAML frontmatter");
  }
  for (const [id, key] of keysById) {
    const count = references.get(id) ?? 0;
    if (count === 0) throw new Error(`Missing template reference: ${key}`);
    if (count !== 1) throw new Error(`Repeated template reference: ${key}`);
  }
  return rendered;
}
