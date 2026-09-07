/** Browser-safe MCP session status + stub bridge (no node builtins). */
import { envStr } from "../core/env.js";

export type McpBridgeResult =
  | { ok: true; data: unknown; label: string; via: string }
  | { ok: false; data: null; label: string; code: string; via: string };

function bridgeMode(): string {
  return envStr("NEWSPULSE_MCP_BRIDGE", "auto").toLowerCase();
}

export function mcpSessionStatus(): { connected: boolean; label: string; bridge: string } {
  const bridge = bridgeMode();
  const f = envStr("NEWSPULSE_MCP_SESSION_FILE", "");
  const w = envStr("NEWSPULSE_MCP_WRAPPER", "") || envStr("GROK_MCP_USE_TOOL", "");
  const connected = Boolean(f || w);
  if (connected) return { connected: true, label: "MCP session/wrapper env present", bridge };
  return {
    connected: false,
    label:
      "MCP UNCONNECTED — connect via MCP host (e.g. Grok /mcps OAuth) or set NEWSPULSE_MCP_SESSION_FILE + NEWSPULSE_MCP_WRAPPER; optional NEWSPULSE_MCP_BRIDGE=cli",
    bridge,
  };
}

/** Browser stub — real CLI bridge is mcpBridgeNode.ts (dynamic-imported from Node only). */
export function callMcpBridge(_method: string, _toolName?: string, _toolArgs?: unknown): McpBridgeResult {
  const sess = mcpSessionStatus();
  if (!sess.connected) {
    return { ok: false, data: null, code: "MCP_SESSION_REQUIRED", via: "none", label: sess.label };
  }
  return {
    ok: false,
    data: null,
    code: "MCP_USE_NODE_BRIDGE",
    via: "browser-stub",
    label: "MCP session env seen but tool calls require Node CLI bridge (mcpBridgeNode) — run package script judge/cli",
  };
}

