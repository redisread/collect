import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const client = new URL("../dist/client/", import.meta.url);
const hash = createHash("sha256");
async function fingerprint(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "sw.js") continue;
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    hash.update(path.pathname.slice(client.pathname.length));
    if (entry.isDirectory()) await fingerprint(path);
    else hash.update(await readFile(path));
  }
}
await fingerprint(client);
const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
hash.update(source);
await writeFile(new URL("sw.js", client), source.replace("__BUILD_ID__", hash.digest("hex").slice(0, 16)));
