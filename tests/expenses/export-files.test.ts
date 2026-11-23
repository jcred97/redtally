import assert from "node:assert/strict";
import test from "node:test";
import { create as readFont, type Font } from "fontkit";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import type { ExpenseExportRow } from "../../app/(dashboard)/_lib/expense-groups/access";
import { expenseCsvResponse } from "../../app/(dashboard)/expense-groups/[id]/_lib/expenses/export";
import { expensePdfResponse, expenseXlsxResponse } from "../../app/(dashboard)/expense-groups/[id]/_lib/expenses/export-files";

const base: ExpenseExportRow = {
  id: 1, title: "Lunch", merchant: "Café", amountCentavos: 10,
  date: new Date("2026-11-18T00:00:00Z"), timeMinutes: 1439,
  notes: null, categoryName: "Food", paymentMethod: "CASH", paymentProviderName: null,
};

function source(rows: ExpenseExportRow[]) {
  return { publicId: "test", async *batches() { yield rows; } };
}

async function pdfText(response: Response, inspectGlyphs = false, outlineCharacters: readonly string[] = []) {
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdf.getDocument({
    data: new Uint8Array(await response.arrayBuffer()), useWasm: false,
    disableFontFace: true, fontExtraProperties: outlineCharacters.length > 0,
    verbosity: pdf.VerbosityLevel.ERRORS,
  });
  const document = await loading.promise;
  try {
    const pages: string[] = [];
    const missingGlyphs: string[] = [];
    const fonts = new Map<string, Font>();
    const outlines = new Map<string, string>();
    for (let page = 1; page <= document.numPages; page++) {
      const pdfPage = await document.getPage(page);
      const content = await pdfPage.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      if (inspectGlyphs || outlineCharacters.length > 0) {
        const operators = await pdfPage.getOperatorList();
        let currentFont = "";
        for (let index = 0; index < operators.fnArray.length; index++) {
          if (operators.fnArray[index] === pdf.OPS.setFont) {
            currentFont = operators.argsArray[index][0] as string;
            continue;
          }
          if (operators.fnArray[index] !== pdf.OPS.showText) continue;
          const glyphs = operators.argsArray[index][0] as Array<number | { fontChar: string; unicode: string }>;
          for (const glyph of glyphs) {
            if (typeof glyph === "number") continue;
            // PDF.js maps the embedded font's .notdef glyph to U+E000.
            // Extractable Unicode alone cannot prove that a visible glyph exists.
            if (glyph.fontChar === "\uE000") {
              missingGlyphs.push(glyph.unicode);
            }
            if (outlineCharacters.includes(glyph.unicode)) {
              let font = fonts.get(currentFont);
              if (!font) {
                const embedded = pdfPage.commonObjs.get(currentFont) as { data: Uint8Array };
                const parsed = readFont(Buffer.from(embedded.data));
                assert.ok("glyphForCodePoint" in parsed, "Expected an embedded font, not a font collection");
                font = parsed;
                fonts.set(currentFont, font);
              }
              const outline = font.glyphForCodePoint(glyph.fontChar.codePointAt(0)!).path.toSVG();
              outlines.set(glyph.unicode, outline);
            }
          }
        }
      }
    }
    return { pages: document.numPages, text: pages.join("\n"), missingGlyphs, outlines };
  } finally { await loading.destroy(); }
}

async function renderedEmoji(response: Response, character: string) {
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdf.getDocument({
    data: new Uint8Array(await response.arrayBuffer()), useWasm: false,
    disableFontFace: true, verbosity: pdf.VerbosityLevel.ERRORS,
  });
  const document = await loading.promise;
  const factory = document.canvasFactory as {
    create(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };
    destroy(target: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }): void;
  };
  let target: ReturnType<typeof factory.create> | undefined;
  try {
    const page = await document.getPage(1);
    const text = await page.getTextContent();
    const item = text.items.find((item) => "str" in item && item.str === character);
    assert.ok(item && "str" in item, `Missing selectable emoji: ${character}`);
    const viewport = page.getViewport({ scale: 3 });
    target = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: target.canvas, canvasContext: target.context, viewport }).promise;

    // Inspect only the emoji's reserved text area, excluding surrounding report
    // text. A hidden Unicode glyph must have visible artwork at that position.
    const [left, bottom] = viewport.convertToViewportPoint(
      item.transform[4], item.transform[5] - item.height * 0.4,
    );
    const [right, top] = viewport.convertToViewportPoint(
      item.transform[4] + item.width, item.transform[5] + item.height * 1.2,
    );
    const x = Math.floor(Math.min(left, right));
    const y = Math.floor(Math.min(top, bottom));
    const pixels = target.context.getImageData(
      x, y, Math.ceil(Math.abs(right - left)), Math.ceil(Math.abs(bottom - top)),
    ).data;
    let visible = 0;
    let colored = 0;
    const palette = new Map<string, number>();
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue, alpha] = pixels.subarray(index, index + 4);
      if (!alpha) continue;
      if (Math.min(red, green, blue) < 230) visible++;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) <= 40) continue;
      colored++;
      // Quantizing avoids making the test sensitive to minor antialiasing changes.
      const color = `${red >> 4},${green >> 4},${blue >> 4}`;
      palette.set(color, (palette.get(color) ?? 0) + 1);
    }
    return { visible, colored, palette: [...palette].sort(([left], [right]) => left.localeCompare(right)) };
  } finally {
    if (target) factory.destroy(target);
    await loading.destroy();
  }
}

test("XLSX stores typed amounts and literal user text with every expense field", async () => {
  const response = await expenseXlsxResponse(source([
    { ...base, title: "=1+1", merchant: "+cmd", notes: "one\ntwo", paymentMethod: "CREDIT_CARD", paymentProviderName: "@BANK" },
    { ...base, id: 2, amountCentavos: 2147483647 },
  ]));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-disposition")!, /\.xlsx"$/);
  const rows = await readSheet(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(rows[1], ["2026-11-18", "23:59", "=1+1", "+cmd", 0.1, "Food", "Credit card", "@BANK", "one\ntwo"]);
  assert.equal(rows[2][4], 21474836.47);
});

test("CSV and XLSX keep plain column names and preserve user-entered emoji and CJK text", async () => {
  const expense: ExpenseExportRow = {
    ...base,
    title: "午餐 🍱",
    merchant: 'Café, "Market" 🛒',
    categoryName: "食品 🥢",
    paymentMethod: "PAY_LATER",
    paymentProviderName: "後払い 🏦",
    notes: "家族 👨‍👩‍👧‍👦\n日本語 한국어",
  };
  const headers = ["Date", "Time (Asia/Manila)", "Title", "Merchant", "Amount (PHP)", "Category", "Payment Method", "Payment Provider", "Notes"];
  const expectedTextRow = [
    "2026-11-18", "23:59", expense.title, expense.merchant, "0.10",
    expense.categoryName, "Pay Later", expense.paymentProviderName, expense.notes,
  ];
  const csv = Papa.parse<string[]>(await expenseCsvResponse(source([expense])).text(), { skipEmptyLines: true });
  assert.deepEqual(csv.errors, []);
  assert.deepEqual(csv.data, [headers, expectedTextRow]);

  const workbook = await expenseXlsxResponse(source([expense]));
  const rows = await readSheet(Buffer.from(await workbook.arrayBuffer()));
  assert.deepEqual(rows, [headers, expectedTextRow.map((value, index) => index === 4 ? 0.1 : value)]);
  assert.equal(typeof rows[1][4], "number");
});

test("PDF paginates long reports and preserves fields and exact total", async () => {
  const rows = Array.from({ length: 45 }, (_, index): ExpenseExportRow => ({
    ...base, id: index + 1, title: `Expense ${index + 1}`, notes: "A long note. ".repeat(50),
    paymentMethod: index === 0 ? "PAY_LATER" : "BANK_TRANSFER", paymentProviderName: index === 0 ? "Shopee" : "My bank",
  }));
  const response = await expensePdfResponse(source(rows));
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const result = await pdfText(response);
  assert.ok(result.pages > 1);
  for (const value of ["Expense 1", "Expense 45", "Café", "23:59", "Payment Method: Pay Later", "Payment Provider: Shopee",
    "Payment Method: Bank transfer", "Payment Provider: My bank", "Food", "4.50"])
    assert.ok(result.text.includes(value), `Missing PDF text: ${value}`);
});

test("PDF embeds visible Chinese, Japanese, Korean, and emoji glyphs in every user text field", async () => {
  const expense = {
    ...base,
    title: "午餐 🍱 中文 日本語 한국어",
    merchant: "台灣商店 🛒 𠮷野家 コーヒー・スーパー",
    categoryName: "食品・식비 🥢",
    paymentProviderName: "中國銀行 🏦",
    notes: "家族 👨‍👩‍👧‍👦 | 開発者 👩🏽‍💻 | 旗 🇵🇭 🇯🇵 | café ❤️",
  };
  const result = await pdfText(await expensePdfResponse(source([expense])), true);
  // PDF text extraction may insert spaces between independently positioned CJK runs.
  const compact = (value: string) => value.replace(/\s/gu, "");
  for (const value of [expense.title, expense.merchant, expense.categoryName, expense.paymentProviderName, expense.notes]) {
    assert.ok(compact(result.text).includes(compact(value)), `Missing or changed PDF text: ${value}`);
  }
  assert.doesNotMatch(result.text, /[\u0000\uFFFD]/u);
  assert.deepEqual(result.missingGlyphs, [], "The PDF must contain real glyph outlines, not missing-character boxes");
});

test("PDF preserves adjacent emoji, skin tones, flags, keycaps, and ZWJ sequences with color artwork", async () => {
  const emoji = "😀😃🫩 👍👍🏽👍🏻 🏽 🇵🇭🇯🇵 1️⃣#️⃣ ✈︎✈️ ♥︎❤️ 👩🏽‍💻👨‍👩‍👧‍👦";
  const result = await pdfText(await expensePdfResponse(source([{ ...base, title: emoji, notes: emoji }])), true);
  // VS15/VS16 select text/color presentation of the same symbol. The embedded
  // selectable fallback font uses one glyph for both, so extraction may canonicalize them.
  // Keep skin tones, keycap marks, regional indicators, and ZWJ sequences exact.
  const compact = (value: string) => value.replace(/[\s\uFE0E\uFE0F]/gu, "");
  assert.equal(compact(result.text).split(compact(emoji)).length - 1, 2);
  assert.doesNotMatch(result.text, /[\u0000\uFFFD]/u);
  assert.deepEqual(result.missingGlyphs, []);
});

test("PDF renders emoji in color with distinct flags and skin tones", async () => {
  const palettes = new Map<string, Awaited<ReturnType<typeof renderedEmoji>>["palette"]>();
  for (const character of ["🇵🇭", "🇯🇵", "👍🏻", "👍🏽", "👩🏽‍💻", "🍱", "1️⃣"]) {
    const response = await expensePdfResponse(source([{ ...base, title: character }]));
    const result = await renderedEmoji(response, character);
    assert.ok(result.visible > 20, `Missing visible emoji artwork: ${character}`);
    // Keycaps may have an intentionally gray design, but the other fixtures
    // must contain actual color instead of a monochrome font outline.
    if (character !== "1️⃣") assert.ok(result.colored > 20, `Monochrome emoji artwork: ${character}`);
    palettes.set(character, result.palette);
  }
  assert.notDeepEqual(palettes.get("🇵🇭"), palettes.get("🇯🇵"), "Country flags must have distinct colored artwork");
  assert.notDeepEqual(palettes.get("👍🏻"), palettes.get("👍🏽"), "Skin-tone modifiers must affect the colored artwork");
});

test("PDF keycaps have visible outlines and country flags have distinct artwork", async () => {
  const characters = ["1️⃣", "#️⃣", "🇵🇭", "🇯🇵"];
  const result = await pdfText(await expensePdfResponse(source([
    { ...base, title: characters.join(" ") },
  ])), true, characters);
  // A font can map Unicode correctly while its keycap glyph is empty or its
  // country flags all contain the same blank border. Inspect the actual subset.
  for (const character of characters) {
    assert.ok(result.outlines.get(character), `Empty or missing glyph outline: ${character}`);
  }
  assert.notEqual(result.outlines.get("1️⃣"), result.outlines.get("#️⃣"));
  assert.notEqual(result.outlines.get("🇵🇭"), result.outlines.get("🇯🇵"));
});

test("PDF preserves mixed CJK and emoji notes across line wraps and page boundaries", async () => {
  const phrase = "中文採購 日本語のコーヒー 한국어 식비 🍱 👩🏽‍💻 🇵🇭";
  const expenses = Array.from({ length: 8 }, (_, index) => ({
    ...base,
    id: index + 1,
    title: `記録${index + 1} 🛒`,
    notes: Array.from({ length: 24 }, (_, note) => `${index + 1}-${note + 1}: ${phrase}`).join("\n"),
  }));
  const result = await pdfText(await expensePdfResponse(source(expenses)), true);
  const compact = (value: string) => value.replace(/\s/gu, "");
  const text = compact(result.text);
  assert.ok(result.pages > 1);
  for (const expense of expenses) {
    assert.ok(text.includes(compact(expense.title)), `Missing expense heading: ${expense.title}`);
    for (const note of expense.notes.split("\n")) {
      assert.ok(text.includes(compact(note)), `Missing wrapped note: ${note}`);
    }
  }
  assert.equal(text.split(compact(phrase)).length - 1, 8 * 24);
  assert.doesNotMatch(result.text, /[\u0000\uFFFD]/u);
  assert.deepEqual(result.missingGlyphs, []);
});

test("empty exports produce usable PDF and XLSX files", async () => {
  const pdf = await pdfText(await expensePdfResponse(source([])));
  assert.match(pdf.text, /^Expenses\b/);
  assert.match(pdf.text, /Expense count: 0\b/);
  assert.match(pdf.text, /Total: PHP 0\.00\b/);
  assert.match(pdf.text, /No expenses/);
  const workbook = await expenseXlsxResponse(source([]));
  const rows = await readSheet(Buffer.from(await workbook.arrayBuffer()));
  assert.equal(rows.length, 1);
});

test("file exports stop and close the source when aborted between batches", async () => {
  for (const exportFile of [expensePdfResponse, expenseXlsxResponse]) {
    const controller = new AbortController();
    let closed = false;
    let reads = 0;
    await assert.rejects(exportFile({
      publicId: "test",
      async *batches() {
        try {
          reads++;
          yield [base];
          controller.abort();
          reads++;
          yield [base];
          reads++;
        } finally { closed = true; }
      },
    }, controller.signal), { name: "AbortError" });
    assert.equal(closed, true);
    assert.equal(reads, 2);
  }
});
