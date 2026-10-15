# ExtractMint Product-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the full ExtractMint page as a product-first document workbench while preserving the existing conversion and review behavior.

**Architecture:** Keep the current Vite, React, and CSS architecture. Update the existing hero and workbench markup in place, restyle the existing page sections, and add one small local WebGL canvas adapted from ThreeUI Community’s MIT-licensed TopoField shader. The local adapter avoids importing ThreeUI’s full catalog and its sandboxed page dependencies while still using the visual source requested by the user.

**Tech Stack:** React 19, TypeScript, Vite, existing CSS, Framer Motion, Lucide icons, WebGL 1, ThreeUI Community TopoField shader source (MIT; adapted locally).

## Global Constraints

- Do not change extraction algorithms, OCR behavior, supported file types, local-processing behavior, review semantics, or export formats.
- Do not add authentication, billing, server-side file processing, or new product capabilities.
- Keep text, forms, tables, upload, settings, buttons, and disclosures in accessible HTML; the shader must never carry required information.
- Keep the redesign responsive and usable without WebGL or motion.

---

## File Map

- `src/App.tsx` — update the hero copy and visual hierarchy; retain the existing converter state, handlers, IDs, file input, settings, status, exports, result workspace, and lower-page sections.
- `src/App.css` — restyle the header, hero, converter, exports, summary, review workspace, and lower-page sections; keep the current selectors for data and interaction surfaces wherever possible.
- `src/index.css` — simplify the global page background and add consistent keyboard focus styling.
- `src/components/TopoFieldBackdrop.tsx` — create and dispose of the decorative TopoField WebGL canvas; expose no product controls or data.
- `src/components/TopoFieldBackdrop.css` — provide the static CSS field shown during reduced motion or when WebGL is unavailable.
- `THIRD_PARTY_NOTICES.md` — preserve the MIT notice for the ThreeUI shader source adapted by the local canvas component.
- `package.json` and `package-lock.json` — leave unchanged; do not install the full ThreeUI package for this one shader.

## Integration Decision

The linked ThreeUI Community source exports `TopoField` from `src/shaders/neuform-isolated/NeuformBatchEffects.tsx`, but that component renders a sandboxed iframe around a full HTML demo. Its source includes unrelated Tailwind, Iconify, GSAP, and ScrollTrigger CDN script tags, while the npm package contains the full catalog. Reuse only the TopoField background shader and its canvas-rendering idea in a small local React component. Do not copy the demo HTML, its unrelated content, or its CDN script tags. The local visual must issue no network requests and must not delay converter use.

## Implementation Plan

### Task 1: Add the local ThreeUI TopoField visual and static fallback

**Files:**
- Create: `src/components/TopoFieldBackdrop.tsx`
- Create: `src/components/TopoFieldBackdrop.css`
- Create: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Produces: `TopoFieldBackdrop()`, a decorative component with no props. It paints only a low-contrast field behind page content; it does not accept or inspect files or conversion state.

- [ ] **Step 1: Add the upstream MIT attribution**

Create `THIRD_PARTY_NOTICES.md` with this complete notice:

```markdown
# Third-party notices

## ThreeUI Community — TopoField shader

Source: https://github.com/MengTo/threeui/tree/main/src/shaders/neuform-isolated
Adapted portion: the TopoField topographic contour and grid shader, used by `src/components/TopoFieldBackdrop.tsx`.

MIT License

Copyright (c) 2026 Meng To

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create the fallback background stylesheet**

Create `src/components/TopoFieldBackdrop.css` with a paper-colored static grid and contour-like radial detail. Keep the canvas transparent so this layer remains visible underneath it:

```css
.topo-field-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 72% 28%, rgba(18, 185, 129, 0.08), transparent 48%),
    repeating-linear-gradient(0deg, rgba(16, 32, 41, 0.025) 0 1px, transparent 1px 48px),
    repeating-linear-gradient(90deg, rgba(16, 32, 41, 0.025) 0 1px, transparent 1px 48px);
  mask-image: linear-gradient(90deg, transparent, #000 28%, #000 80%, transparent);
}

.topo-field-backdrop canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0.22;
  mix-blend-mode: multiply;
}
```

- [ ] **Step 3: Create the WebGL adapter**

Create `src/components/TopoFieldBackdrop.tsx` and import `useEffect` and `useRef` from React plus the stylesheet above. Implement a WebGL 1 fullscreen quad using only local shader strings: use the upstream TopoField simplex-noise function, animated noise offset, ten contour bands, and 48-pixel grid spacing. Set the fragment output to a translucent ink/mint line color over transparent pixels so the CSS layer remains the fallback. Use `getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false })`; if context creation, shader compilation, or program linking fails, leave the canvas transparent and let the CSS background show through.

The render loop must:
- Cap device-pixel ratio at `1.5`, resize the backing canvas to its CSS size, and update the viewport and resolution uniform.
- Draw one static frame and start no animation loop when `prefers-reduced-motion: reduce` matches.
- Pause animation when the hero is outside the viewport or the document is hidden; resume only when it is visible and motion is allowed.
- Listen for `webglcontextlost`, stop animation on loss, and remove every observer, event listener, animation frame, shader, buffer, and program on unmount.
- Never read file input, converter state, or local storage.

The component must return this decorative DOM, with WebGL setup and cleanup in the effect described above:

```tsx
return (
  <div className="topo-field-backdrop" aria-hidden="true">
    <canvas ref={canvasRef} />
  </div>
)
```

For shader math, adapt the source at `https://github.com/MengTo/threeui/blob/main/src/shaders/neuform-isolated/sources/topo-field.html` around its `snoise`, `gridLines`, `noiseScale`, and `numBands` calculations. Change only the final color/alpha composition to match ExtractMint’s paper and mint palette.

- [ ] **Step 4: Check the component contract and notice**

Confirm the component exports `TopoFieldBackdrop`, has no external imports beyond React and its local stylesheet, and the MIT attribution appears in `THIRD_PARTY_NOTICES.md`. Confirm no dependency was added to either package manifest.

### Task 2: Make the hero and converter read as one workbench

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `TopoFieldBackdrop()` from Task 1.
- Produces: the existing `#converter` destination, upload input, OCR state controls, privacy/support disclosures, progress, exports, and summary remain in the same React application and retain their existing handlers.

- [ ] **Step 1: Add the decorative layer inside the hero section**

Import `TopoFieldBackdrop` next to the existing PDF components. As the first child of `<section id="top" className="hero-section">`, add:

```tsx
<TopoFieldBackdrop />
```

Keep it before `hero-copy` and `product-stage`. Its CSS z-index is behind the content, and its wrapper is `aria-hidden`.

- [ ] **Step 2: Replace the long headline and lede**

Keep the existing `motion.h1` and its animation props. Replace its two child strings with the following exact copy:

```tsx
<motion.span
  initial={{ opacity: 0, y: 18 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.08 }}
>
  Turn statements into
</motion.span>
<motion.span
  initial={{ opacity: 0, y: 18 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.18 }}
>
  clean data.
</motion.span>
```

Replace the hero lede with: `Upload a statement or receipt. ExtractMint structures transactions, checks the balance trail, and exports useful files in your browser.`

- [ ] **Step 3: Keep the converter as the right-hand hero surface**

Keep the current `id="converter"` on `.converter-card`, the same `inputRef`, the `accept` value, `handleDrop`, `processFiles`, OCR handlers, cache handlers, privacy/support action handlers, progress values, download functions, and balance calculations. Change only visible copy as follows:
  - Converter toolbar: `Live extraction desk` → `Document workbench`.
  - Dropzone heading: `Drop documents here` → `Drop a document or choose a file`.
  - Dropzone helper: `or click to choose PDFs, images, or ExtractMint review packs (.zip)` → `PDF, scan, receipt, spreadsheet, DOCX, or ExtractMint review pack`.
  - OCR group label: `OCR settings` → `Processing settings` if the current `aria-label` is retained.

Keep the upload surface before processing settings in DOM order. Keep the four settings labels and both privacy/support `details` in the card; do not change their state or move them outside `#converter`.

- [ ] **Step 4: Remove only the old decorative stage elements**

Remove the `stage-frame`, `stage-glow`, `scan-path`, `data-chip`, and `document-stack` JSX and their motion wrappers from `product-stage`. Retain `product-stage` and its `converter-card`. Do not remove the `motion.div` around the converter if it contains the converter itself; remove only its continuous float animation so the large interactive card stays still while users interact with it.

- [ ] **Step 5: Preserve the page’s navigation anchors**

Keep the existing `href="#top"`, `href="#converter"`, `href="#formats"`, `href="#agent"`, `href="#video"`, and `href="#faq"` targets and keep the pricing link. Do not rename the section IDs.

### Task 3: Restyle the page shell, hero, and converter

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: the hero and converter DOM from Task 2, existing status classes, and the existing palette tokens.
- Produces: a compact responsive hero/workbench composition and visible keyboard focus.

- [ ] **Step 1: Simplify the global page background and keyboard focus**

In `src/index.css`, replace the multi-hue body background with the following:

```css
body {
  background: #f8f7f1;
  color: var(--ink);
}

:focus-visible {
  outline: 3px solid rgba(8, 122, 101, 0.72);
  outline-offset: 3px;
}
```

Keep the existing `:root` tokens and base element rules unless a later selector overrides them. Do not remove native keyboard outlines from controls.

- [ ] **Step 2: Refine the tokens and section width**

In `src/App.css`, retain the current ink, muted, paper, panel, line, mint, amber, rose, and steel tokens. Reduce shadow strength to `--shadow: 0 20px 54px rgba(24, 39, 39, 0.10)` and `--tight-shadow: 0 10px 28px rgba(28, 43, 48, 0.08)`. Keep the shared page width at `min(1180px, calc(100% - 32px))` on desktop, and use the existing 24px total side gutter (12px per side) at mobile.

- [ ] **Step 3: Restyle the header and hero**

Update the existing selectors instead of adding duplicate rules:
  - Header: flatter white surface, 16px radius, thin border, small shadow; keep sticky placement, logo, navigation targets, and CTA.
  - Hero: `grid-template-columns: minmax(0, 0.82fr) minmax(460px, 1.18fr)`, `gap: clamp(28px, 4vw, 60px)`, top-align the copy, and remove the full viewport minimum height. Keep the shader behind the content.
  - Layering: set `.hero-copy` and `.product-stage` to `position: relative; z-index: 1` so they paint above the absolute decorative backdrop.
  - Product stage: use `min-height: 0` and `display: block`; remove the obsolete empty space that was reserved for floating document artwork.
  - Headline: `font-size: clamp(42px, 5vw, 64px)`, `line-height: 1.02`, and `letter-spacing: -0.035em`.
  - Lede: cap width at `50ch`, use `font-size: 17px`, and set line-height to `1.6`.
  - Proof signals and supported-format strip: use simple text/icon rows with mint status icons; remove their pill-like heavy shadows.
  - Converter: white opaque card, `border-radius: 18px`, a soft border, and the reduced shadow token. Remove `backdrop-filter`.
  - Dropzone: maintain at least `190px` height, show a clear dashed border and static mint-tinted fill, remove the continuous shimmer, and expose a visible `:focus-within` treatment for the file input.
  - Processing settings: arrange the existing toggles/selects in a compact two-column grid on desktop; let each optional cache detail and privacy/support disclosure span the full width.
  - Progress, exports, and sanity check: use separate labeled surfaces in their current DOM order. Make unavailable exports visibly disabled; use muted neutral status, amber for review, and mint only for a match/success.

- [ ] **Step 4: Remove obsolete stage decoration styles**

Delete the now-unused `.stage-frame`, `.stage-glow`, `.scan-path`, `.data-chip`, `.document-stack`, and `.paper` rules and their mobile overrides. Keep no CSS animations for decorative elements that Task 2 removed. Retain shared motion used by the product where it communicates progress.

### Task 4: Make the review workspace and full page easier to scan

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Consumes: existing summary, batch queue, review, PDF preview, workflow, trust, agent, FAQ, and footer markup.
- Produces: a consistent visual system for the rest of the site without changing transaction review behavior.

- [ ] **Step 1: Restyle conversion summary and section spacing**

Set `.summary-band` to a flat bordered three-column band with no large shadow. Use a consistent section top spacing of `clamp(52px, 7vw, 88px)` for the results, workflow, trust, and agent sections. Keep the existing heading text, metric values, and IDs.

- [ ] **Step 2: Restyle the queue and review panels**

Update `.workspace-grid`, `.file-list`, `.preview-panel`, `.mini-stat`, `.summary-cards`, `.validation-card`, `.review-split`, `.table-controls`, `.table-wrap`, and `.source-preview`:
  - Use white or paper surfaces with thin borders and consistent 14–18px radii.
  - Visually distinguish the active file, confidence, and validation status.
  - Keep review warnings amber and matching validation green/mint.
  - Keep the table’s `min-width: 980px` and horizontal scroll container so editing remains usable on narrow screens.
  - Keep the source PDF preview optional and below the table on tablet/mobile as the existing breakpoint already does.

- [ ] **Step 3: Restyle lower-page sections**

Apply the same width, border, radius, and typography scale to workflow cards, trust content, the agent panel, FAQ, and footer. Keep all current copy, form fields, links, and behavior. Avoid adding new feature cards or changing product claims.

### Task 5: Check responsive layout, reduced motion, and the existing build

**Files:**
- No new test files. Adjust `src/App.css` or `src/components/TopoFieldBackdrop.css` only if the inspection shows a defect.

- [ ] **Step 1: Verify the existing production build**

Run `npm ci` first if the repository has no `node_modules` directory. This restores the exact lockfile dependency set; no package changes are planned.

Run from the repository root:

```bash
npm run build
```

Expected: TypeScript compilation and the Vite production build complete successfully. Do not add or run the project’s test scripts for this visual change.

- [ ] **Step 2: Run the local preview**

Run `npm run dev -- --host 127.0.0.1` from the repository root and open the printed local URL in the browser.

- [ ] **Step 3: Inspect desktop and mobile**

Inspect the home page at desktop (1440px), tablet (768px), and mobile (390px) widths. Confirm:
  - The headline, local-processing statement, and upload action are the first-screen hierarchy.
  - The converter card fits without horizontal overflow; its dropzone remains immediately visible.
  - The header links still land at their original sections.
  - The page sections, batch queue, summary cards, table, and PDF preview have no clipping or overlapping controls.

- [ ] **Step 4: Inspect behavior and accessibility without changing data logic**

Use the in-app sample flow to confirm result review, filtering/editing, balance checks, and at least one export remain operable. For file selection/drop, use a disposable synthetic CSV created under `work/` rather than a personal financial file. Keyboard through the header, upload label/input, settings, disclosures, review controls, and export buttons; confirm visible focus. Enable `prefers-reduced-motion: reduce` and disable WebGL in browser settings/devtools; confirm the static fallback remains visible and all controls still work.

- [ ] **Step 5: Review the diff and commit the completed redesign**

Run:

```bash
git diff --check
git status --short
```

Review that only the planned app, CSS, notice, and spec/plan files changed. Commit the implementation on the existing local branch with:

```bash
git add src/App.tsx src/App.css src/index.css src/components/TopoFieldBackdrop.tsx src/components/TopoFieldBackdrop.css THIRD_PARTY_NOTICES.md docs/superpowers/plans/2026-10-15-extractmint-product-first-redesign.md
git commit -m "feat: redesign ExtractMint workbench"
```

Do not deploy, push, or create a pull request as part of this plan.

## Acceptance Checklist

- [ ] The first screen communicates statement conversion, local processing, and the upload action clearly.
- [ ] Existing file selection/drop, processing settings, progress, exports, balance checks, table editing/filtering, batch review, and PDF preview remain present and functional.
- [ ] The full site uses a restrained and consistent visual system at desktop, tablet, and mobile widths.
- [ ] The TopoField shader is decorative, locally implemented from the ThreeUI Community source, and has a static CSS fallback.
- [ ] Reduced-motion users and browsers without WebGL can use the complete conversion workflow.
- [ ] No conversion, privacy, or export behavior changed; no production deployment was made.
