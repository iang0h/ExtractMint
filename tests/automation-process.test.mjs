import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const agentGuidePath = join(repoRoot, "AGENTS.md");
const deployPolicyPath = "/Users/iangoh/.codex/automations/vercel-deploy-batch-policy.md";
const extractMintAutomationPath =
  "/Users/iangoh/.codex/automations/extractmint-improvement-loop/automation.toml";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertContains = (content, value, label) => {
  assert.match(content, new RegExp(escapeRegExp(value)), label);
};

assert.ok(existsSync(agentGuidePath), "AGENTS.md should document ExtractMint agent routing");

const agentGuide = readFileSync(agentGuidePath, "utf8");
for (const required of [
  "## Skill Routing",
  "Superpowers",
  "gstack",
  "vercel-deploy-queue.md",
  "npm run test:seo",
  "npm run test:agent",
]) {
  assertContains(agentGuide, required, `AGENTS.md should include ${required}`);
}

const deployPolicy = readFileSync(deployPolicyPath, "utf8");
assertContains(
  deployPolicy,
  "Worker cadence can be higher than deploy cadence",
  "deploy policy should state worker cadence and deploy cadence are separate",
);
assertContains(
  deployPolicy,
  "Hourly at :05 - ExtractMint",
  "deploy policy should match ExtractMint's hourly worker cadence",
);

const extractMintAutomation = readFileSync(extractMintAutomationPath, "utf8");
assertContains(
  extractMintAutomation,
  "FREQ=HOURLY;INTERVAL=1;BYMINUTE=5;BYSECOND=0",
  "ExtractMint worker should remain hourly at :05",
);
assertContains(
  extractMintAutomation,
  "Superpowers",
  "ExtractMint worker should explicitly use Superpowers",
);
assertContains(
  extractMintAutomation,
  "gstack",
  "ExtractMint worker should explicitly use gstack for browser QA when relevant",
);
