import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "nexus-luma-check-"));

// Inline <script> blocks of the active pages (external/src scripts are skipped).
const pages = ["index.html", "book/index.html", "booked/index.html", "project/index.html", "onboarding/index.html", "admin/index.html"];
const files = pages.map((page) => {
  const html = readFileSync(page, "utf8");
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join("\n");
  const out = join(dir, page.replace(/\W+/g, "_") + ".js");
  writeFileSync(out, scripts);
  return out;
});

files.push("js/nl-track.js", "js/funnel-config.js");
for (const dir of ["netlify/functions", "netlify/functions/_crm"]) {
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".js") || name.endsWith(".mjs")) files.push(join(dir, name));
  }
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`Syntax check failed: ${file}`);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax checks passed (${files.length} files).`);
