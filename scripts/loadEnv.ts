import fs from "node:fs";
import path from "node:path";

/** Load KEY=value lines from a git-ignored env file in the working
 *  directory. Missing files are skipped; existing env vars win. */
export function loadEnvFile(name: string): void {
  const file = path.join(process.cwd(), name);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
