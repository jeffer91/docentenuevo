import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "pages-dist");

function git(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const commitFull = process.env.GITHUB_SHA || git(["rev-parse", "HEAD"]);
const commit = commitFull === "unknown" ? git(["rev-parse", "--short", "HEAD"]) : commitFull.slice(0, 7);
const branch = process.env.GITHUB_REF_NAME || git(["branch", "--show-current"]);
const payload = {
  app: "SIACD",
  commit,
  commit_full: commitFull,
  branch,
  built_at: new Date().toISOString(),
};

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "version.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`SIACD build ${payload.commit} (${payload.branch})`);
