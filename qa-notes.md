# QA notes

## SEO-era exhaustive audit

The updated homepage rendered with the new SEO title and descriptive copy. The shared modal implementation renders each tool into `#modal-container` and exposes a close button that calls `window.modalManager.hide('<modal-id>')`; this contract is used for the non-destructive open/close harness.

## Control-level audit

All 31 registered tool modals rendered and closed successfully. The harness exercised 16 select controls and all 84 select options, 12 numeric inputs at their minimum and maximum bounds, the single range input at both bounds, 4 checkboxes in both states, 10 text/password inputs, and the available canvas controls. No control-level failures were reported.

## Functional exports completed

The merge fixture produced a valid PDF. Split with `1-2, 3, 5` produced three PDF parts. Organise produced a valid organised PDF. Compression completed and correctly reported that the fixture was already well-compressed rather than falsely claiming a size reduction.

## N-up option regression

The N-up control audit selected all count, arrangement, scaling, orientation, paper, order, margin, gutter, and border choices. A functional configuration was then prepared with 4-up, vertical arrangement, Fill page, A4 landscape, column-major order, and borders. After preview debounce, the modal reported `A4 landscape · 2×2 grid · Fill page · 2 sheets`, with margin and gutter both `0` and disabled.

The clean N-up export completed successfully for the configured 4-up, vertical, Fill page, A4 landscape, column-major, bordered layout. The browser reported `N-up PDF created (4-up on A4, fill page)` and the processed-page counters advanced by 5.

## Conversion regression

PDF-to-JPG completed for all five pages. The captured download metadata was `application/zip` with filename `qa-fixture-jpg.zip`, confirming the MIME correction.

The N-up download was captured as a valid PDF named `qa-fixture-4up.pdf`.

JPG-to-PDF accepted both controlled JPEG and PNG inputs, exercised both A4 and original-size page modes, and exported a two-page PDF. The processed-page counter advanced by 2 with no error toast.

HTML-to-PDF accepted the controlled HTML file, exercised both width options and both background modes, and exported successfully. The processed-page counter advanced by 1 without an error toast.

## New defect found and fixed during exhaustive option testing

Edit PDF initially failed to retain a page-click marker because `renderStage()` cleared `lastClick` immediately after the click handler set it. The marker state is now cleared only when changing pages; the updated implementation allows text/image placement to proceed. Browser reloading is required before retesting this fix.

After the fix, Edit PDF accepted the five-page fixture, placed `QA edited text` at a real canvas marker with font size 18, increased the placed-item count from 0 to 1, and exported the edited PDF successfully.
