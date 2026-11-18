# PDF fallback fonts

These fonts are bundled for offline PDF generation. The Noto fonts use the SIL
Open Font License 1.1 and OpenMoji uses CC BY-SA 4.0. Their original licenses are
included beside them.
Only the glyphs used in a report are embedded in the exported PDF. Color emoji
are drawn as vector artwork over an invisible, selectable Unicode text layer.

| File | Source revision | SHA-256 |
| --- | --- | --- |
| `OpenMoji-black-glyf.ttf` | [OpenMoji](https://github.com/hfg-gmuend/openmoji/blob/3e01de523ddefe9c5e46a7765b15efef04bf9002/font/OpenMoji-black-glyf/OpenMoji-black-glyf.ttf) | `b0c48711651c0502956692beb2e130ae2fc9b0df3b01febf758b3aeb41501dc4` |
| `NotoEmoji.ttf` | [Google Fonts Noto Emoji](https://github.com/google/fonts/blob/5bd87dfc525c8a0d1d8529d3684716e00c3fc59a/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf) | `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551` |
| `NotoSansCJKjp-Regular.otf` | [Noto CJK](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf) | `68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5` |

The full CJK face covers simplified and traditional Chinese, Japanese, and Korean,
with Japanese forms for shared Han characters. The bundled OpenMoji SVG artwork
in `../emoji/` supplies colors, including full country flags and skin-tone variants. Font selection
preserves complete grapheme clusters before shaping and wrapping.

Noto Emoji provides the selectable text for flags and keycaps: OpenMoji's black font has empty keycap
glyphs and plain rectangles for flags. Noto's monochrome country flags include
country-code lettering, which is invisible beneath the color artwork. OpenMoji
handles other emoji text, preserving skin-tone and joined-sequence text that can
share glyphs in Noto Emoji. Explicit text-presentation symbols stay monochrome.

`pdf-emoji.ts` uses pdfmake's completed line positions to align the color artwork.
This small adapter depends on pdfmake's internal `_pdfMakePages` metadata, so the
package is pinned to `0.3.14`. When updating it, verify the adapter against the
installed renderer and run both text-extraction and rendered-color regressions.

OpenMoji emojis designed by [OpenMoji](https://openmoji.org/), the open-source emoji and
icon project. License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
PDFs using OpenMoji glyphs include this attribution and license link in their footer.

When updating a font, replace its license too, update this table, and run the PDF
export tests and visual checks. Keep `next.config.ts` tracing these assets into the
export route's deployment bundle.
