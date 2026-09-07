import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BawAgenticWalletAdapter } from "../adapters/bawAgenticWallet.js";
import { BinanceAgentOsAdapter } from "../adapters/binanceAgentOs.js";
import { mcpSessionStatus } from "../adapters/mcpBridge.js";

describe("adapter fail-closed without baw/MCP session", () => {
  it("BAW live balances fail closed when baw missing/unconnected", async () => {
    const baw = new BawAgenticWalletAdapter({ mode: "live" });
    const bal = await baw.getBalances();
    assert.equal(bal.usedMock, false);
    assert.match(bal.label, /BAW_MISSING|UNCONNECTED|BAW_RUNNER|auth signin|install/i);
    // Must not invent populated live balances from hub HTTP
    assert.ok(Array.isArray(bal.data));
  });

  it("BAW live swap does not invent hub-HTTP PENDING", async () => {
    const baw = new BawAgenticWalletAdapter({ mode: "live" });
    const swap = await baw.executeSwap({
      fromAsset: "USDT",
      toAsset: "BNB",
      amountIn: 10,
      notionalUsd: 10,
    });
    assert.equal(swap.usedMock, false);
    assert.ok(["REJECTED", "UNCONNECTED"].includes(swap.data.status));
    assert.doesNotMatch(swap.label, /hub webpage|HTTP 200/i);
  });

  it("BAW live x402 does not invent PENDING from hub ping", async () => {
    const baw = new BawAgenticWalletAdapter({ mode: "live" });
    const pay = await baw.payX402({ notionalUsd: 2, purpose: "premium-signal" });
    assert.equal(pay.usedMock, false);
    assert.ok(["REJECTED", "UNCONNECTED"].includes(pay.data.status));
  });

  it("MCP placeOrder rejects without session (no bare fetch success)", async () => {
    assert.equal(mcpSessionStatus().connected, false);
    const mcp = new BinanceAgentOsAdapter({ mode: "live" });
    const ack = await mcp.placeOrder({
      symbol: "BTC",
      side: "BUY",
      sizeUsd: 100,
      price: 50000,
      clientOrderId: "test-1",
    });
    assert.equal(ack.data.status, "REJECTED");
    assert.match(ack.label, /REJECTED|UNCONNECTED|session|OAuth|MCP/i);
    assert.notEqual(ack.data.status, "SUBMITTED_LIVE_PENDING_CONFIRM");
  });
});

