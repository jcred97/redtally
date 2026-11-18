# Color emoji artwork

`openmoji-color.json.gz` contains the official OpenMoji 17.0.0 SVG artwork, keyed
by uppercase Unicode code points without emoji presentation selectors. Keeping
one compressed bundle avoids thousands of deployment assets. The PDF exporter
loads it locally and draws only the emoji used in each report as vector artwork.

All emoji artwork is designed by [OpenMoji](https://openmoji.org/), the open-source
emoji and icon project, and licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The original license is included in `../fonts/OpenMoji-LICENSE.txt`. Exported PDFs
include attribution and the license link in their footer. The artwork is
unmodified; only its packaging and lookup keys change.

Source: [OpenMoji 17.0.0 color SVG release](https://github.com/hfg-gmuend/openmoji/releases/download/17.0.0/openmoji-svg-color.zip).
Archive SHA-256: `59b0cd9f6fe033818fc02585cea42bea9fba5d68a4d3a3639bfe5d5cc3805689`.

To regenerate, download that archive and run:

```powershell
node --import tsx scripts/build-emoji-art.mts <path-to-openmoji-svg-color.zip>
```

The builder verifies the archive checksum and produces deterministic gzip output.
When changing releases, update the source and checksum, rebuild the bundle, and
run the PDF text, rendered-color, pagination, and browser-download checks.
