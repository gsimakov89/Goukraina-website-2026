#!/usr/bin/env node
/**
 * Run build_site.py with the project venv when present (Vercel installCommand),
 * else python3 / python on PATH. Uses Node so we never rely on `sh` (exit 127 on some CI).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildSite = path.join(root, "build_site.py");

function venvInterpreter() {
  if (process.platform === "win32") {
    const w = path.join(root, ".venv", "Scripts", "python.exe");
    return fs.existsSync(w) ? w : null;
  }
  const py3 = path.join(root, ".venv", "bin", "python3");
  const py = path.join(root, ".venv", "bin", "python");
  if (fs.existsSync(py3)) return py3;
  if (fs.existsSync(py)) return py;
  return null;
}

const candidates = [venvInterpreter(), "python3", "python"].filter(Boolean);

for (const cmd of candidates) {
  const result = spawnSync(cmd, [buildSite], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.error?.code === "ENOENT") continue;
  if (result.status === 0) {
    const logo = path.join(root, "public", "assets", "img", "logo.png");
    if (!fs.existsSync(logo)) {
      console.error(
        "run_build_site: missing",
        logo,
        "— add site photos under public/assets/img/ (see build_site.py SITE_MEDIA)."
      );
      process.exit(1);
    }
  }
  process.exit(result.status === null ? 1 : result.status);
}

console.error("run_build_site: no Python found (expected .venv from install, or python3/python on PATH).");
process.exit(127);
