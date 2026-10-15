# ExtractMint product-first redesign

## Context

ExtractMint is a Vite and React document conversion app. The current homepage combines a large headline, a decorative conversion illustration, and the live converter in the first screen. The converter exposes OCR settings, cache controls, privacy and support details, progress, exports, and balance checks. Below it are the converted workspace, PDF review, workflow explanation, privacy and format claims, the Ask ExtractMint panel, and FAQs. The current mint, ink, and paper palette is a useful brand foundation.

The visual hierarchy gives the headline and decorative stage more weight than the upload action. The converter also presents several controls close together before a first-time visitor has chosen a file. The redesign will make the conversion task and its privacy model immediately clear, then give review and export a more coherent workspace.

## Goals

- Make choosing or dropping a document the clearest first action.
- Give processing status, balance checks, review rows, and exports a consistent visual hierarchy.
- Keep the existing brand recognizable while improving spacing, typography, grouping, and responsive layout.
- Preserve current extraction, OCR, review, edit, import, export, privacy, support, and agent behavior.
- Use ThreeUI for one restrained visual accent that supports the data and ledger theme.

## Design

Use a product-first workbench layout. Keep the header compact, make the hero heading shorter and easier to scan, and align its supporting copy and primary upload action with the live converter. At desktop widths, keep a balanced two-column composition with enough width for the upload area; on smaller screens, stack the copy and converter with the upload action near the top.

Within the converter, make the drop area and selected-file status the primary surface. Group OCR language, force-OCR, and cache options into a compact processing-settings area. Keep privacy and support details available as secondary disclosures. After a file is loaded, make progress, export actions, and balance sanity checks read as successive parts of one workflow rather than unrelated controls.

Restyle the converted workspace as the core product surface: clearly separate the batch queue, selected-file summary, review controls, transaction table, and optional source-PDF preview. Preserve all existing controls and information, with clearer status, confidence, warning, and success treatments. Retain the workflow explanation, privacy and format information, agent panel, FAQ, and footer, using a more consistent section width and spacing system.

Retain the warm paper background, dark ink text, and mint accent. Refine the typography scale, reduce oversized empty space, and use borders and shadows sparingly so that data remains easy to read. Use a ThreeUI `TopoField` shader as a low-contrast, decorative hero backdrop. Keep it behind open space rather than text or controls, load it lazily, and provide a CSS fallback for unavailable WebGL. Respect reduced-motion preferences and mark the visual layer decorative to assistive technology. ThreeUI is used as a visual component source, not as a replacement for the converter's semantic controls.

## Boundaries

- Do not change extraction algorithms, OCR behavior, supported file types, local-processing behavior, review semantics, or export formats.
- Do not add authentication, billing, server-side file processing, or new product capabilities.
- Keep text, forms, tables, upload, settings, buttons, and disclosures in accessible HTML; the shader must never carry required information.
- Keep the redesign responsive and usable without WebGL or motion.

## Acceptance criteria

- The first screen clearly communicates document conversion, browser-side processing, and the upload action.
- The live converter, settings, progress states, export options, validation, table editing and filtering, and PDF preview remain available and behave as before.
- The batch review queue and results are visually easier to scan, with warnings distinguished from successful checks.
- The ThreeUI visual is subtle, lazy-loaded, decorative, and has a static fallback; reduced-motion users can complete the full conversion flow.
- The full page remains readable and operable at desktop, tablet, and mobile widths.

## Verification approach

After implementation, run the existing production build and inspect the page at desktop and mobile widths. Check the upload-to-review-to-export flow, keyboard access to the semantic controls, and the fallback behavior when the shader is disabled or unavailable. Avoid adding a separate test framework for this visual refresh.
