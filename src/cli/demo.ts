import { runAgentOnce, describeUniverse } from "../core/agent.js";
import { concentration, pnlByAsset } from "../core/portfolio.js";
import { AgentOsFacade } from "../adapters/agentOsFacade.js";
import { BAW_DOCUMENTED_DAILY_CAPS_USD } from "../adapters/bawAgenticWallet.js";
import { envStr } from "../core/env.js";

async function main(): Promise<void> {
  const mode = envStr("NEWSPULSE_MODE", "live").toLowerCase();
  console.log("===========================================================");
  console.log(" NewsPulse LIVE smoke — Track A / Binance Agent OS");
  console.log(" Brain + x402 premium signals + dual-rail MCP/BAW");
  console.log("===========================================================");
  console.log("Universe:", describeUniverse());
  console.log("NEWSPULSE_MODE:", mode, "(default live)");
  console.log("");

  // Drive adapters from env (default live). Do not force paper.
  const facade = new AgentOsFacade();
  const status = facade.dualStatus();
  console.log("-- Dual-rail Agent OS --");
  console.log(`  MCP: ${status.mcp.endpoint}`);
  console.log(`       oauth_client_id=${status.mcp.oauthClientId} | mode=${status.mcp.mode}`);
  console.log(`       ${status.mcp.label}`);
  console.log(`  BAW: ${status.baw.hubUrl}`);
  console.log(`       mode=${status.baw.mode} | ${status.baw.label}`);
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
    // Exercise premium-signal branch (also triggered by conflicting BTC fixtures)
    premium: { force: true, notionalUsd: 2 },
  });

  console.log("Adapter (combined):", result.adapterMeta.label);
  console.log("  MCP endpoint:", result.adapterMeta.mcp.endpoint);
  console.log("  BAW hub:", result.adapterMeta.baw.hubUrl);
  console.log("Mode:", result.mode, "| usedMock:", result.adapterMeta.usedMock);
  console.log("");

  console.log("-- x402 premium signal --");
  if (result.premiumSignal) {
    const p = result.premiumSignal;
    console.log(`  attempted:      ${p.attempted}`);
    console.log(`  reason:         ${p.reason}`);
    console.log(`  paymentStatus:  ${p.paymentStatus}`);
    console.log(`  notionalUsd:    $${p.notionalUsd} (cap documented $${p.documentedCapUsd}/day)`);
    console.log(`  label:          ${p.label}`);
    if (p.paymentId) console.log(`  paymentId:      ${p.paymentId}`);
    console.log(`  contentApplied: ${p.contentApplied}`);
    if (p.contentNote) console.log(`  contentNote:    ${p.contentNote}`);
    if (p.symbols) {
      console.log(
        `  hints:          symbols=${p.symbols.join(",")} sentiment=${p.sentiment} source=${p.sourceLabel}`
      );
    }
  } else {
    console.log("  (disabled)");
  }
  console.log("");

  console.log("-- Scores (after premium merge if applied) --");
  for (const s of result.scores) {
    console.log(
      `  ${s.symbol.padEnd(5)} score=${s.score.toFixed(3).padStart(7)} conf=${s.confidence.toFixed(2)}`
    );
    for (const r of s.reasons.slice(0, 2)) console.log(`         - ${r}`);
  }
  console.log("");

  console.log("-- Decisions (MCP / CEX live path) --");
  let pending = 0;
  let rejectedAuth = 0;
  let executed = 0;
  for (const d of result.decisions) {
    const mark = d.executed ? "EXEC" : "skip";
    console.log(
      `  ${mark} ${d.side.padEnd(4)} ${d.symbol.padEnd(5)} score=${d.score.toFixed(3)} size=$${d.sizeUsd.toFixed(0)} @ ${d.price}  ${d.mockLabel ?? ""}`
    );
    if (d.rejectReason) console.log(`         reject: ${d.rejectReason}`);
    if (d.executed) executed++;
    const label = (d.mockLabel ?? "").toLowerCase();
    if (label.includes("pending")) pending++;
    if (label.includes("auth required") || label.includes("rejected")) rejectedAuth++;
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

  console.log("-- Portfolio snapshot --");
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

  console.log("-- Live smoke checks --");
  console.log(`  facade mode:     ${facade.mode}`);
  console.log(`  MCP oauth id:    ${status.mcp.oauthClientId}`);
  console.log(`  decisions seen:  ${result.decisions.length} (executed attempts=${executed})`);
  console.log(`  pending-ish:     ${pending}`);
  console.log(`  auth/reject-ish: ${rejectedAuth}`);
  console.log(
    `  BAW status:      ${result.bawAction?.status ?? "none"}`
  );
  console.log(
    `  x402 premium:    ${result.premiumSignal?.paymentStatus ?? "none"}`
  );

  const liveOk = facade.mode === "live" || mode === "live";
  const bawOk =
    !result.bawAction ||
    ["SUBMITTED_LIVE_PENDING", "REJECTED", "SUBMITTED_MOCK", "FILLED_PAPER", "SKIPPED"].includes(
      result.bawAction.status
    );

  const prem = result.premiumSignal;
  const premOk =
    prem &&
    prem.attempted &&
    ["PENDING", "REJECTED", "PAID_PAPER", "PAID_MOCK"].includes(prem.paymentStatus);

  // Success: agent ran on live default; dual-rail visible; premium branch exercised;
  // no claim of paper BUY/SELL success. Accept pending confirm OR clear auth reject.
  if (!liveOk && mode !== "paper" && mode !== "mock") {
    console.error("FAIL: expected live mode (or explicit paper/mock opt-in)");
    process.exitCode = 1;
    return;
  }
  if (status.mcp.oauthClientId !== "grok") {
    console.error("FAIL: oauth_client_id must be grok");
    process.exitCode = 1;
    return;
  }
  if (result.decisions.length < 1) {
    console.error("FAIL: expected scoring/decision loop to produce decisions");
    process.exitCode = 1;
    return;
  }
  if (!bawOk) {
    console.error("FAIL: unexpected BAW status");
    process.exitCode = 1;
    return;
  }
  if (!premOk) {
    console.error(
      "FAIL: expected premium-signal branch attempt with PENDING/REJECTED/PAID_* status, got:",
      prem
    );
    process.exitCode = 1;
    return;
  }
  // Live must not claim a filled x402 that did not happen
  if (facade.mode === "live" && prem && prem.paymentStatus === "PAID_PAPER") {
    console.error("FAIL: live mode must not report PAID_PAPER for x402");
    process.exitCode = 1;
    return;
  }

  // In live mode, executed MCP paths should not advertise FILLED_PAPER as success.
  const paperFillClaim = result.decisions.some((d) =>
    (d.mockLabel ?? "").includes("FILLED_PAPER") || (d.mockLabel ?? "").includes("PAPER SIM fill")
  );
  if (facade.mode === "live" && paperFillClaim) {
    console.error("FAIL: live mode must not report paper fills as MCP success");
    process.exitCode = 1;
    return;
  }

  console.log("PASS: live smoke — brain + x402 premium + dual-rail OK.");
  console.log(
    "Note: SUBMITTED_LIVE_PENDING_CONFIRM / auth REJECTED / x402 PENDING|REJECTED are expected without interactive OAuth/hub session."
  );
  console.log("Disclaimer: Not financial advice. Live trades require Agent OS user confirmation.");
  console.log("See AGENT_OS_NOTES.md and DEMO.md");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
