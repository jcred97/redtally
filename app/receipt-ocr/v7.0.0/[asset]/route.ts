import { readFile } from "node:fs/promises";
import { join } from "node:path";

const assets = new Map([
  ["worker.min.js", "tesseract.js/dist/worker.min.js"],
  ["tesseract-core-lstm.wasm.js", "tesseract.js-core/tesseract-core-lstm.wasm.js"],
  ["tesseract-core-simd-lstm.wasm.js", "tesseract.js-core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["eng.traineddata.gz", "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"],
]);

// Prerender the pinned dependencies so production serves static files from this origin.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Array.from(assets.keys(), (asset) => ({ asset }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const packagePath = assets.get(asset);
  if (!packagePath) return new Response(null, { status: 404 });

  const body = await readFile(join(process.cwd(), "node_modules", packagePath));
  return new Response(body, {
    headers: {
      "Content-Type": asset.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
