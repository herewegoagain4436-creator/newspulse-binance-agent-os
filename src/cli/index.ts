/**
 * NewsPulse CLI — once | universe
 */
import { runAgentOnce, describeUniverse } from "../core/agent.js";
import { AgentOsFacade } from "../adapters/agentOsFacade.js";

const cmd = process.argv[2] ?? "once";

async function once(): Promise<void> {
  const facade = new AgentOsFacade();
  const result = await runAgentOnce({
    adapter: facade,
    seedPositions: {
      SOL: { qty: 30, avgPrice: 155 },
      DOGE: { qty: 10000, avgPrice: 0.13 },
    },
    enableBawPath: true,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  if (cmd === "universe") {
    console.log(describeUniverse());
    return;
  }
  if (cmd === "demo") {
    await import("./demo.js");
    return;
  }
  await once();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
