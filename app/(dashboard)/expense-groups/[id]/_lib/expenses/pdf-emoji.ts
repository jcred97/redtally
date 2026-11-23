import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import SVGtoPDF from "svg-to-pdfkit";
import type { TCreatedPdf } from "pdfmake/interfaces";

type LayoutInline = {
  text: string;
  x: number;
  width: number;
  fontSize: number;
  opacity?: number;
};

type LayoutLine = {
  x: number;
  y: number;
  inlines: LayoutInline[];
  getAscenderHeight(): number;
  getHeight(): number;
};

type LayoutPage = {
  items: Array<{ type: string; item: LayoutLine }>;
};

let colorArtwork: Promise<Record<string, string>> | undefined;

function loadColorArtwork() {
  colorArtwork ??= (async () => {
    const bytes = await readFile(path.join(process.cwd(), "server/pdf/emoji/openmoji-color.json.gz"));
    const artwork = JSON.parse(gunzipSync(bytes).toString("utf8")) as Record<string, string>;
    if (!artwork || typeof artwork !== "object" || Array.isArray(artwork)) {
      throw new Error("The PDF emoji artwork bundle is invalid.");
    }
    return artwork;
  })().catch((error) => {
    colorArtwork = undefined;
    throw error;
  });
  return colorArtwork;
}

function finite(...values: number[]) {
  return values.every(Number.isFinite);
}

function drawEmoji(document: PDFKit.PDFDocument, artwork: Record<string, string>, line: LayoutLine, inline: LayoutInline) {
  // The artwork has one entry per complete emoji sequence. Presentation
  // selectors share artwork, while modifiers, flags, and ZWJ remain intact.
  // A standalone modifier can form a grapheme with preceding whitespace. Keep
  // that whitespace in the selectable text, but resolve only the visible emoji.
  const key = Array.from(inline.text.trim(), (character) => character.codePointAt(0)!)
    .filter((codePoint) => codePoint !== 0xfe0e && codePoint !== 0xfe0f)
    .map((codePoint) => codePoint.toString(16).toUpperCase().padStart(4, "0"))
    .join("-");
  const svg = artwork[key];
  if (typeof svg !== "string" || !svg) throw new Error(`No PDF color artwork is available for emoji ${inline.text}.`);
  const ascender = line.getAscenderHeight();
  const height = line.getHeight();
  const baseline = line.y + ascender;
  if (!finite(inline.x, inline.width, inline.fontSize, line.x, line.y, ascender, height)
    || inline.width <= 0 || inline.fontSize <= 0 || height <= 0) {
    throw new Error("The PDF emoji layout has invalid dimensions.");
  }

  const size = Math.min(inline.width, inline.fontSize, height);
  const left = line.x + inline.x + (inline.width - size) / 2;
  // Align an em-sized square near the text baseline, then constrain it to the
  // line's actual bounds so mixed CJK/emoji lines and page breaks cannot clip it.
  const top = Math.max(line.y, Math.min(baseline - size * 0.85, line.y + height - size));
  document.save().opacity(1);
  try {
    SVGtoPDF(document, svg, left, top, {
      width: size, height: size, preserveAspectRatio: "xMidYMid meet", assumePt: true,
      warningCallback: (warning) => {
        throw new Error(`Unable to render PDF emoji ${inline.text}: ${warning}`);
      },
    });
  } finally {
    document.restore();
  }
}

export async function drawColorEmoji(pdf: TCreatedPdf, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const document = await pdf.getStream();
  signal?.throwIfAborted();

  // pdfmake 0.3.14 retains its laid-out lines on the PDFKit stream. Keep this
  // private integration here: upgrading pdfmake requires checking these shapes
  // and the rendered-color/page-wrapping regressions before changing the pin.
  const pages = (document as PDFKit.PDFDocument & { _pdfMakePages?: unknown })._pdfMakePages;
  if (!Array.isArray(pages)) throw new Error("PDF emoji rendering requires pdfmake 0.3.14 layout metadata.");
  const buffered = document.bufferedPageRange();
  if (buffered.start !== 0 || buffered.count !== pages.length) {
    throw new Error("PDF emoji rendering requires all pages to be buffered.");
  }

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    signal?.throwIfAborted();
    const page = pages[pageIndex] as LayoutPage;
    if (!page || !Array.isArray(page.items)) throw new Error("The PDF emoji page layout is unavailable.");
    document.switchToPage(pageIndex);
    for (const item of page.items) {
      if (item.type !== "line") continue;
      const line = item.item;
      if (!line || !Array.isArray(line.inlines)
        || typeof line.getAscenderHeight !== "function" || typeof line.getHeight !== "function") {
        throw new Error("The PDF emoji line layout is unavailable.");
      }
      for (const inline of line.inlines) {
        signal?.throwIfAborted();
        // The text builder reserves opacity zero exclusively for emoji. Its
        // original Unicode stays selectable underneath the colored vectors.
        if (inline.opacity !== 0) continue;
        const artwork = await loadColorArtwork();
        signal?.throwIfAborted();
        drawEmoji(document, artwork, line, inline);
      }
    }
  }
}
