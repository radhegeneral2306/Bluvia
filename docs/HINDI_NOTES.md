# Hindi notes: UI language and PDFs

## UI language (src/lib/i18n.js)
- `useT()` returns `{ t, lang, setLang }`. `t('nav.home')`, `t('x.y', { name })` with `{name}` placeholders.
- Language order: change made this session, then `users/{uid}.lang`, then localStorage `bluvia_lang`, then default (admin `en`, staff `hi`).
- Missing key: falls back to English, then to the key text. Add every new key to BOTH `src/locales/en.js` and `src/locales/hi.js` (a unit test enforces the same key set, no empty values, no em/en dash).
- Key naming: `area.name` or `area.sub.name`, lower-case area (`nav`, `common`, `word`, `layout`, `more`, `bill`, `party`...). Page agents should use their page name as the area.

## PDFs: what was found
jsPDF 4 standard fonts (helvetica, courier) only cover Latin-1. Devanagari needs complex shaping (conjuncts, matras that reorder, half forms). jsPDF does NO shaping, so even an embedded Devanagari TTF gives broken output for many words. The reliable approach is to let the browser shape the text and place it as an image.

**Important: src/lib/pdf.js already does this.** `textKit(doc)` (top of file) treats any string matching `NON_LATIN` (anything outside Latin-1 plus a few punctuation chars and the rupee sign) as an image: `kit.measure`, `kit.wrap` and `kit.text` render it on a canvas (`FONT_STACK` starts with "Noto Sans Devanagari") and call `doc.addImage`. So Devanagari party names already take that path whenever the PDF code goes through `kit.*`. A separate canvas helper was tried and removed, because the existing path already covers Devanagari (not yet confirmed on a real phone).

## Call sites in src/lib/pdf.js (all must use kit.*, never raw doc.text)
These strings can contain Hindi and are drawn through `kit.text` / `kit.wrap` / `block()` / `put()` already:
- ~L239 `center(settings.businessName, ...)` and L240 `block(a, ...)` for `settings.address` (thermal header)
- L244 `block('Party: ...')`, L245 `party.phone` (thermal)
- L256 `kit.wrap(l.itemName, 22)` item names (thermal)
- L281 `block('Note: ...')` and L444 `put('Note: ...')` bill notes
- L317 `partyName`, L354 `kit.wrap(partyName, 255)`, L356 party address lines, L378/L380 `kit.fit` + `kit.wrap` for the party name (invoice)
- L326 `settings.address` lines (invoice sender block)
- L437 jar names in the "Other jars" line
- L489 `settings.businessName` and L493 `Statement: ${party.name}` (statement)
To switch these to `textToImage`, the single place to change is `kit.text` (the `isImg(t)` branch, ~L77-L101) plus `kit.measure` (~L47): call `hasDevanagari(t)` there, `await textToImage(...)` BEFORE drawing (so the build functions need a pre-pass that renders all Hindi strings first, because `kit.text` is synchronous), and then `doc.addImage`. This was deliberately not done: the existing canvas path already covers it and pdf.js is not in agent F's file list.
Also check: `makeUpiQr` L200 puts the party name into the UPI note (`tn`). Keep that ASCII or percent-encoded; UPI apps may reject non-Latin remarks.
Static labels in the PDF ("Party:", "Note:", "Statement:") stay English on purpose.

## Risks
- Fonts: the image uses the device's own fonts. Android (India builds) has Noto Sans Devanagari; stock Android elsewhere usually does too. iOS has Devanagari Sangam MN (no Noto name, falls to sans-serif which resolves to it). Mac has Devanagari MT / Kohinoor but NOT Mangal. Windows has Mangal/Nirmala UI. A device with no Devanagari font draws empty boxes (tofu) in the PDF permanently.
- Size: each Hindi line is an extra PNG. At 4 px per pt a 10 pt line is about 3 to 8 KB. A bill with 5 Hindi strings adds tens of KB; a long statement with many Hindi rows can add a few hundred KB. Cache identical strings (pdf.js already keeps a `cache` Map).
- Hindi text in an image is not selectable or searchable in the PDF, and prints as bitmap (sharp enough at 4x, soft if scaled up).
- First render: fonts may load lazily; `textToImage` awaits `document.fonts.load`, the current pdf.js path does not and may draw with a fallback font on the very first PDF.
- Mixed lines (Latin plus Hindi) are drawn as one image with the Devanagari stack, so Latin letters in that line use the Devanagari font's Latin glyphs and can look slightly different from the surrounding Helvetica text.

## NOT verified (no real device here)
- No PDF was generated or viewed on a real Android or iOS phone, and none in a desktop browser. Unit tests run in Node, where there is no canvas, so only `hasDevanagari` and the fail-soft null path are tested.
- Not verified: actual glyph shaping quality, baseline/clipping of matras (the 1.5x line height is an estimate), font availability on the owner's and staff phones, WhatsApp sharing of the resulting PDF, file size on a real statement.
- Next step: open a bill for a party named in Hindi (for example "राम स्वीट्स, गली नंबर 5") on the owner's Android phone and on one iPhone, in both thermal and invoice layouts.
