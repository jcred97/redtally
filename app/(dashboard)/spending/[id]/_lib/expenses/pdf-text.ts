import { readFile } from "node:fs/promises";
import path from "node:path";
import pdfMake from "pdfmake/build/pdfmake";
import type { ContentText } from "pdfmake/interfaces";

const fontFiles = {
  NotoCJK: "NotoSansCJKjp-Regular.otf",
  NotoEmoji: "NotoEmoji.ttf",
  OpenMoji: "OpenMoji-black-glyf.ttf",
} as const;
type FallbackFont = keyof typeof fontFiles;

const loadedFonts = new Map<FallbackFont, Promise<void>>();
const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });
const emojiPattern = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u;
const flagOrKeycapPattern = /[\p{Regional_Indicator}\u20e3\u{e0020}-\u{e007f}]/u;
const cjkPattern = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}\u2e80-\u303f\u31c0-\u31ef\ufe10-\ufe1f\ufe30-\ufe4f\uff00-\uffef]/u;

function loadFont(font: FallbackFont) {
  let loading = loadedFonts.get(font);
  if (!loading) {
    loading = (async () => {
      const file = fontFiles[font];
      const bytes = await readFile(path.join(process.cwd(), "server/pdf/fonts", file));
      pdfMake.addVirtualFileSystem({ [file]: bytes.toString("base64") });
      // These fallback faces are regular; mapping every style also supports
      // Unicode in bold expense headings without falling back to Roboto.
      pdfMake.addFonts({ [font]: { normal: file, bold: file, italics: file, bolditalics: file } });
    })().catch((error) => {
      loadedFonts.delete(font);
      throw error;
    });
    loadedFonts.set(font, loading);
  }
  return loading;
}

export function createPdfText() {
  const requiredFonts = new Set<FallbackFont>();
  let colorEmoji = false;

  function text(value: string): ContentText[] {
    const runs: ContentText[] = [];
    for (const { segment } of graphemes.segment(value)) {
      // OpenMoji keeps distinct skin-tone/ZWJ glyphs, but its monochrome font
      // has empty keycaps and plain rectangles for flags. Noto supplies those.
      const emoji = emojiPattern.test(segment);
      // An explicit text-presentation selector keeps the monochrome symbol.
      const colored = emoji && !segment.includes("\uFE0E");
      if (colored) colorEmoji = true;
      const font = emoji ? (flagOrKeycapPattern.test(segment) ? "NotoEmoji" : "OpenMoji")
        : cjkPattern.test(segment) ? "NotoCJK" : "Roboto";
      if (font !== "Roboto") requiredFonts.add(font);
      const previous = runs.at(-1);
      // Keep emoji sequences intact for shaping, but let adjacent emoji wrap.
      if (!emoji && previous?.font === font) {
        previous.text += segment;
      } else {
        // Keep an invisible Unicode text layer beneath the vector color artwork
        // so selecting and copying expenses continues to include their emoji.
        runs.push({ text: segment, font, ...(emoji ? { noWrap: true } : {}), ...(colored ? { opacity: 0 } : {}) });
      }
    }
    return runs;
  }

  return {
    text,
    hasColorEmoji: () => colorEmoji,
    usesOpenMoji: () => colorEmoji || requiredFonts.has("OpenMoji"),
    loadFonts: () => Promise.all([...requiredFonts].map(loadFont)),
  };
}
