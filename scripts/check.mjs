import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const html = readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .join("\n");

const dir = mkdtempSync(join(tmpdir(), "nexus-luma-check-"));
const inlineScriptPath = join(dir, "inline-scripts.js");
writeFileSync(inlineScriptPath, scripts);

const files = [
  inlineScriptPath,
  "netlify/functions/analyze-website.js",
  "netlify/functions/create-upgrade-payment.js",
  "netlify/functions/stripe-config.js"
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Syntax checks passed.");

