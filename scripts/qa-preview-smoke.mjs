import { spawn } from "node:child_process";

const baseUrl = process.env.EXTRACTMINT_PREVIEW_URL ?? "http://127.0.0.1:4177";
const routes = ["/", "/llms.txt", "/sitemap.xml", "/openapi.json"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(url, timeoutMs) {
  const started = Date.now();
  while (true) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) return;
    } catch {
      // ignore until timeout
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Preview did not become ready within ${timeoutMs}ms: ${url}`);
    }
    await sleep(250);
  }
}

async function fetchOk(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Non-2xx for ${url}: ${response.status}`);
  return response;
}

const previewProc = spawn("npm", ["run", "preview:fixed"], {
  stdio: "inherit",
  env: process.env,
});

const shutdown = () => {
  if (previewProc.killed) return;
  previewProc.kill("SIGTERM");
};

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

try {
  await waitForReady(`${baseUrl}/`, 20_000);
  for (const route of routes) {
    await fetchOk(`${baseUrl}${route}`);
  }
  console.log(`OK preview smoke: ${routes.length} routes @ ${baseUrl}`);
  shutdown();
} catch (error) {
  shutdown();
  throw error;
}
