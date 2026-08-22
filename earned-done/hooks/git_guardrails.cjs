#!/usr/bin/env node
"use strict";

// Apply a finite literal policy to one Claude Code Bash hook payload.

const MAX_COMMAND_BYTES = 128 * 1024;
const MAX_PAYLOAD_BYTES = MAX_COMMAND_BYTES * 6 + 4096;
const BOUNDARY = "A-Za-z0-9_.-";

function token(expression) {
  return `(?<![${BOUNDARY}])(?:${expression})(?![${BOUNDARY}])`;
}

const GIT = token("git");
const PUSH = token("push");
const RESET = token("reset");
const CLEAN = token("clean");
const BRANCH = token("branch");
const PUSH_FORCE = token("--force");
const PUSH_LEASE = token(
  String.raw`--force-(?:w|wi|wit|with|with-|with-l|with-le|with-lea|with-leas|with-lease)(?:=[^\s;&|()]*)?`,
);
const PUSH_LONG_DESTRUCTIVE = token(
  "--(?:m|mi|mir|mirr|mirro|mirror|de|del|dele|delet|delete|pru|prun|prune)",
);
const SHORT_FORCE = token(String.raw`-(?!-)[A-Za-z0-9_.]*f[A-Za-z0-9_.]*`);
const SHORT_DELETE = token(String.raw`-(?!-)[A-Za-z0-9_.]*d[A-Za-z0-9_.]*`);
const PUSH_REFSPEC = token(String.raw`(?:\+[^\s;&|()]+|:[^\s;&|()]+)`);
const HARD = token("--(?:h|ha|har|hard)");
const BRANCH_FORCE = token("--(?:forc|force)");
const BRANCH_UPPER_FORCE = token(String.raw`-(?!-)[A-Za-z0-9_.]*[DMC][A-Za-z0-9_.]*`);

const POLICIES = [
  [
    "ED-GIT-PUSH",
    PUSH,
    `(?:${PUSH_FORCE}|${PUSH_LEASE}|${PUSH_LONG_DESTRUCTIVE}|${SHORT_FORCE}|${SHORT_DELETE}|${PUSH_REFSPEC})`,
  ],
  ["ED-GIT-RESET", RESET, HARD],
  ["ED-GIT-CLEAN", CLEAN, null],
  ["ED-GIT-BRANCH", BRANCH, `(?:${BRANCH_FORCE}|${SHORT_FORCE}|${BRANCH_UPPER_FORCE})`],
];

function block(reason) {
  process.stderr.write(`BLOCKED by git-guardrails: ${reason}\n`);
  process.exit(2);
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function normalize(command) {
  return command.replace(/\\\r?\n/g, "").replace(/\s+/g, " ");
}

function ordered(text, expressions) {
  let offset = 0;
  for (const expression of expressions) {
    const match = new RegExp(expression).exec(text.slice(offset));
    if (match === null) return false;
    offset += match.index + match[0].length;
  }
  return true;
}

function classify(command) {
  const normalized = normalize(command);
  for (const [policy, subcommand, hazard] of POLICIES) {
    const expressions = hazard === null ? [GIT, subcommand] : [GIT, subcommand, hazard];
    if (ordered(normalized, expressions)) return policy;
  }
  return null;
}

async function readCommand() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_PAYLOAD_BYTES) block("ED-GIT-INPUT-SIZE");
    chunks.push(chunk);
  }
  let payload;
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    payload = JSON.parse(raw);
  } catch {
    block("ED-GIT-INPUT-JSON");
  }
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    block("ED-GIT-INPUT-SHAPE");
  }
  const toolInput = payload.tool_input;
  if (toolInput === null || Array.isArray(toolInput) || typeof toolInput !== "object") {
    block("ED-GIT-INPUT-SHAPE");
  }
  const command = toolInput.command;
  if (typeof command !== "string" || hasUnpairedSurrogate(command)) {
    block("ED-GIT-INPUT-COMMAND");
  }
  if (command.includes("\0")) block("ED-GIT-INPUT-NUL");
  if (Buffer.byteLength(command, "utf8") > MAX_COMMAND_BYTES) {
    block("ED-GIT-INPUT-SIZE");
  }
  return command;
}

async function main() {
  const policy = classify(await readCommand());
  if (policy !== null) block(policy);
}

main().catch(() => block("ED-GIT-INPUT-JSON"));
