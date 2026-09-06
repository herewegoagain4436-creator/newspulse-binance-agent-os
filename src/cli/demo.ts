import { runAgentOnce, describeUniverse } from "../core/agent.js";
import { concentration, pnlByAsset } from "../core/portfolio.js";
import { AgentOsFacade } from "../adapters/agentOsFacade.js";
import { BAW_DOCUMENTED_DAILY_CAPS_USD } from "../adapters/bawAgenticWallet.js";

async function main(): Promise<void> {
  console.log("===========================================================");
  console.log(" NewsPulse DEMO - Track A / Binance Agent OS Mini Hackathon");
  console.log(" Dual-rail: MCP (CEX) + BAW (Wallet / Agentic Hub)");
  console.log("===========================================================");
  console.log("Universe:", describeUniverse());
  console.log("");

  const facade = new AgentOsFacade({ mode: "paper" });
  const status = facade.dualStatus();
  console.log("-- Dual-rail Agent OS --");
  console.log(`  MCP: ${status.mcp.endpoint}`);
  console.log(`       oauth_client_id=${status.mcp.oauthClientId} | ${status.mcp.label}`);
  console.log(`  BAW: ${status.baw.hubUrl}`);
  console.log(`       ${status.baw.label}`);
  console.log(
    `       documented caps (defaults, not guarantees): swap=$${BAW_DOCUMENTED_DAILY_CAPS_USD.swap}/day, defi=$${BAW_DOCUMENTED_DAILY_CAPS_USD.defi}/day, x402=$${BAW_DOCUMENTED_DAILY_CAPS_USD.x402}/day`
  );
  console.log("");

  const result = await runAgentOnce({
    adapter: facade,
    seedPositions: {
      SOL: { qty: 50, avgPrice: 160 },
      DOGE: { qty: 20000, avgPrice: 0.14 },
      AVAX: { qty: 40, avgPrice: 30 },
    },
    defaultOrderUsd: 1500,
    enableBawPath: true,
  });

  console.log("Adapter (combined):", result.adapterMeta.label);
  console.log("  MCP endpoint:", result.adapterMeta.mcp.endpoint);
  console.log("  BAW hub:", result.adapterMeta.baw.hubUrl);
  console.log("Mode:", result.mode, "| usedMock:", result.adapterMeta.usedMock);
  console.log("");

  console.log("-- Scores --");
  for (const s of result.scores) {
    console.log(
      `  ${s.symbol.padEnd(5)} score=${s.score.toFixed(3).padStart(7)} conf=${s.confidence.toFixed(2)}`
    );
    for (const r of s.reasons.slice(0, 2)) console.log(`         - ${r}`);
  }
  console.log("");

  console.log("-- Decisions (MCP / CEX paper path) --");
  let buys = 0;
  let sells = 0;
  for (const d of result.decisions) {
    const mark = d.executed ? "EXEC" : "skip";
    console.log(
      `  ${mark} ${d.side.padEnd(4)} ${d.symbol.padEnd(5)} score=${d.score.toFixed(3)} size=$${d.sizeUsd.toFixed(0)} @ ${d.price}  ${d.mockLabel ?? ""}`
    );
    if (d.rejectReason) console.log(`         reject: ${d.rejectReason}`);
    if (d.executed && d.side === "BUY") buys++;
    if (d.executed && d.side === "SELL") sells++;
  }
  console.log("");

  console.log("-- BAW wallet action (on-chain leg) --");
  if (result.bawAction) {
    console.log(`  status: ${result.bawAction.status}`);
    console.log(`  label:  ${result.bawAction.label}`);
    if (result.bawAction.fromAsset) {
      console.log(
        `  swap:   ${result.bawAction.fromAsset} → ${result.bawAction.toAsset} notional=$${result.bawAction.notionalUsd} usedMock=${result.bawAction.usedMock}`
      );
    }
  } else {
    console.log("  (none)");
  }
  console.log("");

  console.log("-- Paper portfolio --");
  console.log(
    `  cash=$${result.portfolio.cashUsdt.toFixed(2)} equity=$${result.portfolio.equityUsd.toFixed(2)} realizedPnL=$${result.portfolio.realizedPnl.toFixed(2)}`
  );
  for (const p of result.portfolio.positions) {
    console.log(
      `    ${p.symbol}: qty=${p.qty.toFixed(6)} avg=${p.avgPrice} mark=${p.markPrice} uPnL=$${p.unrealizedPnl.toFixed(2)}`
    );
  }
  console.log("  concentration %:", concentration(result.portfolio));
  console.log("  pnl by asset:", pnlByAsset(result.portfolio));
  console.log("");

  console.log("-- Market snapshot --");
  for (const m of result.market) {
    const sign = m.change24hPct >= 0 ? "+" : "";
    console.log(`  ${m.symbol.padEnd(5)} $${m.price}  24h ${sign}${m.change24hPct}%`);
  }
  console.log("");

  const buySyms = result.decisions
    .filter((d) => d.executed && d.side === "BUY")
    .map((d) => d.symbol);
  const sellSyms = result.decisions
    .filter((d) => d.executed && d.side === "SELL")
    .map((d) => d.symbol);

  console.log("-- Demo assertions --");
  console.log(`  executed BUYs:  ${buys} -> [${buySyms.join(", ")}]`);
  console.log(`  executed SELLs: ${sells} -> [${sellSyms.join(", ")}]`);
  console.log(
    `  BAW action:     ${result.bawAction?.status ?? "missing"} (${result.bawAction?.label?.slice(0, 60) ?? "n/a"}…)`
  );

  if (buys < 1 || sells < 1) {
    console.error("FAIL: need at least one BUY and one SELL (MCP paper path)");
    process.exitCode = 1;
    return;
  }
  if (new Set([...buySyms, ...sellSyms]).size < 2) {
    console.error("FAIL: BUY and SELL must cover different assets");
    process.exitCode = 1;
    return;
  }
  if (
    !result.bawAction ||
    (result.bawAction.status !== "FILLED_PAPER" &&
      result.bawAction.status !== "SUBMITTED_MOCK")
  ) {
    console.error("FAIL: need at least one mocked/paper BAW wallet action for dual-rail visibility");
    process.exitCode = 1;
    return;
  }
  console.log("PASS: multi-asset BUY + SELL (MCP paper) + BAW wallet action demonstrated.");
  console.log("Disclaimer: Not financial advice. Paper/mock is not live Binance execution.");
  console.log("See AGENT_OS_NOTES.md and DEMO.md");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
