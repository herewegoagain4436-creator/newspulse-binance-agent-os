import type { McpBridgeResult } from "./mcpBridge.js";
export function callMcpBridgeNode(): McpBridgeResult {
  return { ok: false, data: null, code: "MCP_BROWSER", via: "browser", label: "Node MCP bridge unavailable in browser bundle" };
}
