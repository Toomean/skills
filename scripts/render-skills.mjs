const keyPattern = /^([A-Z][A-Z0-9]*[0-9]+) — (.+)$/u;

export function render(template, catalogue) {
  if (typeof template !== "function") throw new Error("Template must be a function");
  if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) {
    throw new Error("Catalogue must be an object");
  }

  const ids = new Set();
  for (const [key, body] of Object.entries(catalogue)) {
    const match = keyPattern.exec(key);
    if (!match) throw new Error(`Malformed catalogue key: ${key}`);
    const [, id] = match;
    if (ids.has(id)) throw new Error(`Duplicate catalogue ID: ${id}`);
    if (typeof body !== "string" || body.trim() === "") {
      throw new Error(`Catalogue value must be a nonempty string: ${key}`);
    }
    ids.add(id);
  }

  const keys = Object.keys(catalogue);
  const references = new Map();
  const rules = new Proxy({}, {
    get(_target, key) {
      if (typeof key !== "string" || !Object.hasOwn(catalogue, key)) {
        throw new Error(`Unknown or stale template reference: ${String(key)}`);
      }
      references.set(key, (references.get(key) ?? 0) + 1);
      return catalogue[key];
    },
  });
  const rendered = template(rules);
  if (typeof rendered !== "string") throw new Error("Template must return a string");
  if (keys.some((key) => references.get(key) !== 1)) {
    throw new Error("Template references must match catalogue keys exactly once");
  }
  return rendered;
}
