# Helping Hand visual identity

The Helping Hand suite uses one shared ink-mark family alongside the existing editorial typography.

## Marks

- `helping-hand.svg` — suite mark / stamp
- `writing-hand.svg` — Writing Hand, blue accent `#264e7a`
- `publish-hand.svg` — Publish Hand, red accent `#b74234`
- `bum-hand.svg` — BUM Hand, green accent `#5c6f3a`
- `markdown-hand.svg` — Markdown Hand, purple accent `#6f4b7a`
- `dent-hand-suite.svg` — Dent Hand's conversation mark adapted to the Helping Hand family
- `favicon.svg` — dark square suite favicon

Drawing Hand currently uses a simple pencil glyph on the suite launcher rather than pretending it has a settled product mark. Its social card still belongs to the same card system below.

## Social sharing cards

Every public Helping Hand product has its own 1200×630 SVG source card:

- `helping-hand-og.svg` — the six-product family card
- `writing-hand-og.svg`
- `publish-hand-og.svg`
- `bum-hand-og.svg`
- `markdown-hand-og.svg`
- `dent-hand-og.svg`
- `drawing-hand-og.svg`

The deployed pages reference these SVG sources through Netlify Image CDN with `w=1200`, `h=630`, `fit=fill` and `fm=png`. That gives link-preview crawlers an ordinary 1200×630 PNG while keeping the editable, inspectable source artwork in Git.

Each product page supplies its own Open Graph title, description and preview image, plus the corresponding `summary_large_image` Twitter/X metadata. Preview image paths stay origin-relative so a self-hosted deployment advertises and fetches its own assets rather than the upstream site. The root Helping Hand launcher uses the family card.

The social cards share the suite's warm cream/near-black visual language but use product-specific accent panels and straplines so links to different Hands do not all collapse into one generic preview.

The default suite palette remains near-black `#191816` and warm cream `#f5f2ec`. Product colours are accents, not page themes.

Each product page may use its own product mark as its favicon; suite-level utility pages keep the shared suite favicon.

## Usage

Treat the marks as signatures rather than illustrations. Prefer one mark per hero/card. Do not repeat decorative hands throughout working interfaces.

The SVGs are intentionally simple and slightly irregular so they retain an ink-made character while remaining legible at small sizes.
