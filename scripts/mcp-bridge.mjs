#!/usr/bin/env node
/**
 * Honest MCP host bridge for NewsPulse.
 * Prefer a real MCP host session (e.g. Grok /mcps OAuth).
 * Succeeds only with NEWSPULSE_MCP_SESSION_FILE and/or NEWSPULSE_MCP_WRAPPER.
 * Never invents SUBMITTED_LIVE_PENDING_CONFIRM without a real tool call.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const method = process.argv[2] || "tools/list";
const toolName = process.argv[3];
const toolArgsRaw = process.argv[4] || "{}";

function fail(code, message, extra = {}) {
  process.stdout.write(JSON.stringify({ ok: false, code, message, ...extra }) + "\n");
  process.exit(2);
}

const sessionFile = process.env.NEWSPULSE_MCP_SESSION_FILE || "";
const wrapper = process.env.GROK_MCP_USE_TOOL || process.env.NEWSPULSE_MCP_WRAPPER || "";

if (!sessionFile && !wrapper) {
  fail(
    "MCP_SESSION_REQUIRED",
    "No MCP session. Connect via MCP host (e.g. Grok /mcps → OAuth Binance Agent OS), or set NEWSPULSE_MCP_SESSION_FILE / NEWSPULSE_MCP_WRAPPER. Do not open the MCP URL in a browser."
  );
}

if (sessionFile && !existsSync(sessionFile)) {
  fail("MCP_SESSION_MISSING", "Session file not found: " + sessionFile);
}

let session = null;
if (sessionFile) {
  try {
    session = JSON.parse(readFileSync(sessionFile, "utf8"));
  } catch (e) {
    fail("MCP_SESSION_INVALID", "Cannot parse session file: " + e.message);
  }
}

if (wrapper) {
  const args =
    method === "tools/call"
      ? [toolName, toolArgsRaw]
      : method === "tools/list"
        ? ["--list"]
        : [method];
  const r = spawnSync(wrapper, args, {
    encoding: "utf8",
    env: { ...process.env, NEWSPULSE_MCP_SESSION: sessionFile || "" },
    timeout: 60000,
    shell: false,
  });
  if (r.error || r.status !== 0) {
    fail("MCP_WRAPPER_FAILED", r.stderr || r.error?.message || ("exit " + r.status), {
      stdout: r.stdout?.slice(0, 2000),
    });
  }
  process.stdout.write(r.stdout || JSON.stringify({ ok: true, raw: true }) + "\n");
  process.exit(0);
}

fail(
  "MCP_HOST_BRIDGE_INCOMPLETE",
  "Session file found but no host wrapper (set NEWSPULSE_MCP_WRAPPER / GROK_MCP_USE_TOOL). NewsPulse will not guess place_order via unauthenticated fetch.",
  { hasSession: true }
);
