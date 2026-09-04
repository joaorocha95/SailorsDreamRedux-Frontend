# Fonts

All three families are licensed under the **SIL Open Font License, Version 1.1**, which permits
self-hosting, redistribution with the software, and use in a commercial product. None of them
requires attribution in the interface; this file is the notice that travels with the files.

| Family | Files | Source |
| --- | --- | --- |
| Instrument Serif | `instrument-serif-{latin,latin-ext}.woff2` | https://fonts.google.com/specimen/Instrument+Serif |
| DM Sans | `dm-sans-{latin,latin-ext}.woff2` | https://fonts.google.com/specimen/DM+Sans |
| JetBrains Mono | `jetbrains-mono-{latin,latin-ext}.woff2` | https://fonts.google.com/specimen/JetBrains+Mono |

The `.woff2` files are the `latin` and `latin-ext` subsets as served by Google Fonts, taken
unmodified. The `@font-face` rules that pair them with their `unicode-range`s are in
`src/assets/fonts.css`.

**Before this is served publicly**, vendor the full OFL text and each family's copyright line
beside these files — the licence requires both to be distributed with the fonts, and a link is not
the same as distributing them. Each family's own `OFL.txt` ships in its download from the source
above.
