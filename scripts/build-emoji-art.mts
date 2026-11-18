import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { unzipSync, strFromU8 } from "fflate";

const archivePath = process.argv[2];
if (!archivePath) throw new Error("Usage: node --import tsx scripts/build-emoji-art.mts <openmoji-svg-color.zip>");

const archive = await readFile(archivePath);
const expectedHash = "59b0cd9f6fe033818fc02585cea42bea9fba5d68a4d3a3639bfe5d5cc3805689";
if (createHash("sha256").update(archive).digest("hex") !== expectedHash) {
  throw new Error("Expected the official OpenMoji 17.0.0 color SVG release archive. Update its documented source before rebuilding.");
}

const artwork = new Map<string, string>();
for (const [name, bytes] of Object.entries(unzipSync(archive))) {
  const code = name.match(/(?:^|\/)([0-9A-F-]+)\.svg$/)?.[1];
  if (!code) continue;
  // Fully qualified and unqualified emoji use the same color artwork.
  const key = code.split("-").filter((part) => part !== "FE0F").join("-");
  const svg = strFromU8(bytes);
  if (artwork.has(key) && artwork.get(key) !== svg) throw new Error(`Conflicting artwork for ${key}`);
  artwork.set(key, svg);
}
if (artwork.size === 0) throw new Error("The archive did not contain emoji artwork.");

const sorted = Object.fromEntries([...artwork.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
await mkdir("server/pdf/emoji", { recursive: true });
await writeFile("server/pdf/emoji/openmoji-color.json.gz", gzipSync(JSON.stringify(sorted), { level: 9 }));
console.log(`Bundled ${artwork.size} color emoji as compressed SVG artwork.`);
