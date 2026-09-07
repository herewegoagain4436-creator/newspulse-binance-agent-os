/** Node-only MCP CLI bridge. Do not import from UI entrypoints. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { envStr } from "../core/env.js";
import { mcpSessionStatus, type McpBridgeResult } from "./mcpBridge.js";

export function callMcpBridgeNode(method: string, toolName?: string, toolArgs?: unknown): McpBridgeResult {
  const mode = envStr("NEWSPULSE_MCP_BRIDGE", "auto").toLowerCase();
  if (mode !== "cli" && mode !== "auto") {
    return { ok: false, data: null, code: "MCP_BRIDGE_OFF", via: mode, label: "MCP bridge disabled" };
  }
  const sess = mcpSessionStatus();
  if (!sess.connected) {
    return { ok: false, data: null, code: "MCP_SESSION_REQUIRED", via: "none", label: sess.label };
  }
  const script = path.resolve(process.cwd(), "scripts/mcp-bridge.mjs");
  if (!existsSync(script)) {
    return { ok: false, data: null, code: "MCP_BRIDGE_SCRIPT_MISSING", via: "cli", label: "scripts/mcp-bridge.mjs missing" };
  }
  const args = [script, method];
  if (toolName) args.push(toolName);
  if (toolArgs !== undefined) args.push(JSON.stringify(toolArgs));
  const r = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 60000, env: process.env });
  const out = (r.stdout || "").trim();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = out ? JSON.parse(out) : null; } catch { parsed = { raw: out }; }
  if (r.status === 0 && parsed && parsed.ok !== false) {
    return { ok: true, data: parsed.data ?? parsed, label: "MCP bridge tool call succeeded", via: "cli" };
  }
  const msg = String(parsed?.message || parsed?.code || r.stderr || ("exit " + r.status));
  return { ok: false, data: null, code: String(parsed?.code || "MCP_BRIDGE_FAILED"), via: "cli", label: "MCP bridge failed — " + msg };
}

