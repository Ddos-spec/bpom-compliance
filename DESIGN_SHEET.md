# APP SHEET ÔÇö Framed sheet
seed 1652190868 ┬À drawn 2026-10-22 ┬À kind support ┬À light
Brief: Label and BPOM registration compliance checker for Indonesian food and cosmetic SMEs and Disperindag officers

This is the style for this product. Adopt it whole and keep its move intact; everything the sheet does not fix comes from the
shared defaults in references/app-screens.md. Redraw only for a reason you can state (it contradicts the brand, or the product is
used in a way the style does not suit) and say why in your report. The values were measured on real product screens: use them
as given rather than rounding them towards your habits.

## 1. The style
The app chrome is one tinted L-shaped frame; the work sits on a white sheet with a hairline edge and soft corners, so depth comes from a single tone step and no shadow.

**The move:** One tinted frame holds the sidebar and the 48px top bar with no rule between them; the page is a white sheet inset 8px from the window's right and bottom edges, with a 1px edge, 16px corners and no shadow. The active tab is a 2px underline in ink or the accent; everything else in the chrome is grey.

**Colour budget:** under 3%; the brand shrinks to the logo and a 2px tab underline, the data carries the chroma.
**Off-style here:** a border between the sidebar and the top bar; a shadow under the sheet; cards whose border is heavier than the sheet's (#cdcfcf on cards read as heavy in the study); a fourth nesting level: frame, sheet and card are enough; different gutters for the KPI row and the chart row (20 against 24 was flagged).
Distilled from 6 screens: a developer platform overview, an analytics overview, an events analytics tab, a list detail, a reports dashboard, a flow builder. The study's second data hue in this style was an orange (#e88e46) that falls inside the house terracotta range; the third chart colour here is an amber moved out of that range and darkened to 3:1 on white.

**Its face.** Choose one of these (or one of your own of the same weight) before you build, write it in your notes next to
the screen's question, and check that it shows on the first screen. Without one the screen reads as a well-applied kit.
- The frame tinted from the product's colour in place of #f9fbfc: one low-chroma step of its hue (a green-grey for a climate or farm tool, a blue-grey for an observability tool, a stone for a print shop). The sheet stays white.
- The brand's own hue from the brief as --chart-1 in place of the dealt teal, on the main series and the one selected state, at 3:1 or more on white, never violet or indigo.
- IBM Plex Mono for IDs, keys and the figures in tables (one job): its figures have their own drawing, and a developer reads them as the product's.

## 2. Tokens
```css
:root {
  --ground: #f9fbfc;
  --surface: #ffffff;
  --raised: #f4f6f8;
  --active: #ebedee;
  --border: #e8eaec;
  --rule: #f0f1f2;
  --control: #cdced1;
  --text: #131416;
  --muted: #5d5f60;
  --accent: #1b6c80;
  --positive: #1e7b4f;
  --negative: #c4242a;
  --warning: #92400e;
  --chart-1: #1b6c80;
  --chart-2: #2f70bb;
  --chart-3: #a86f0c;
  --pill-positive-bg: #dcfae5; --pill-positive-ink: #04250e;
  --pill-negative-bg: #ffedea; --pill-negative-ink: #831c1e;
  --pill-warning-bg: #fffbeb; --pill-warning-ink: #92400e;
  --pill-neutral-bg: #ebedee; --pill-neutral-ink: #353736;
  --radius-card: 8px;
  --radius-control: 6px;
  --radius-sheet: 16px;
  --sheet-inset: 8px;
  --row-height: 48px;
  --sidebar-width: 228px;
  --gap: 24px;
  --pad: 24px;
  --control-height: 32px;
  --fs-title: 22px;
  --fs-section: 16px;
  --fs-kpi: 28px;
  --fs-body: 14px;
  --fs-small: 12px;
}
```
Density: medium. One gap value, horizontally and vertically. No shadow on anything at rest.

## 3. Type ÔÇö IBM Plex Sans
```html
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```
`font-family: "IBM Plex Sans", Inter, system-ui, sans-serif`. Weights 400, 500, 600. Sizes: title 22px ┬À section 16px ┬À kpi 28px ┬À body 14px ┬À small 12px. KPI values at 400; the semibold goes on the label and the active tab. Second face: IBM Plex Mono, for IDs and keys only.
Numbers: `font-variant-numeric: tabular-nums` on every table, KPI and anything that updates. Sentence case; no tracked capitals.

## 4. Shell ÔÇö Tinted frame, white sheet
Sidebar and top bar share one tinted ground with no rule between them, forming an L; the page lives on a white sheet. Variant one: the sheet butts against the sidebar and the top bar and is inset 8px from the right and bottom edges, 16px radius, 1px edge. Variant two: a flush L-frame with no inset, the frame marked by one rule. Variant three: sidebar and content are two floating panels inset 12px from every edge with a 12px gutter. The top bar, when present, is 48px and holds a centred search, the account button and a help or AI icon. Inside the sheet the content has 24px padding and starts with the breadcrumb or title row.
Numbers: chrome #f6f6f6-#f9fbfc (a warm #f7f6f2 once); sheetInset 8px from the window's right and bottom edges (12 and 16 once each); sheetRadius 10-16, median 16; sheetEdge 1px #eaeaea-#ededed, no shadow; sidebarWidth 220-263 (228 on two screens); topBar 48px on the chrome ground with no rule; search 548x32 centred on the window with a shortcut hint; contentPadding 24; floatingVariant both panels inset 12px with a 12px gutter, radius 10.
On a phone: The frame disappears: the sheet becomes the screen, with a 48px top bar (menu button, title, one action) on the chrome tint. The search moves into the menu sheet or behind an icon.

## 5. Screens

### overview
No pattern in the library for this screen. Compose it from the rules in references/app-screens.md.

### detail ÔÇö Tabbed object detail in a sheet
Inside the sheet: a breadcrumb row at 16/600 (the parent in grey, the current page as the h1, a 24px grey type chip after it) with its actions on the right (a text button and an outlined 32px dropdown). Under it, the object's tabs at 14px with a 2px ink underline that runs 8px past the label, on a 1px rule that spans the sheet. 30px below, the filter row: a label above a 300x32 select on the left; the freshness stamp ('Last updated July 21, 2026') and a 40px refresh button on the right, centred on the select's line. Then 3 KPI cards (value 36/400, its label at 16/600 under it, the period in words) and 2 chart cards, all on one 24px gutter so the rows share column lines. Do not stretch a short card to its neighbour's height (it left 250px of dead white) and do not list legend series that have no data.
On a phone: Breadcrumb shortens to a back link and the h1; tabs scroll; KPI cards stack as label-value rows; charts full width.

### list ÔÇö Count cards that filter
Above a list, 3-5 equal count cards (61px tall, 12px padding, a 13px grey label over a 16/600 value, 8px gap) are the type filter: the selected card gets a 1.5px accent border and a pale accent fill, and the list below shows that type only. Zero counts print as '0' in the same style; no deltas, no icons. This is one place where a row of identical small cards is right: the cards are peers and each one does work.
On a phone: The count cards become a horizontally scrolling row of chips with the count inside each, or a select above the list.

## 6. Always
Real data for this product, written before the markup: names, amounts that add up, dates in order, units on every figure,
honest zeros and dashes. One chart answers one question. No gradients, glows, glass, icons in tinted squares, sparklines on KPIs,
rainbow charts, emoji, lorem or Acme. `<skill>/assets/app.css` and `<skill>/assets/charts.js` are a neutral start set to these
rules. Check with `node <skill>/scripts/lint.mjs <files>` and `node <skill>/scripts/inspect.mjs <page>`: this sheet switches both
to app rules.

Saved to D:/code/bpom-compliance/.taste-skill/direction.json ┬À reprint with `node draw.mjs --show`
