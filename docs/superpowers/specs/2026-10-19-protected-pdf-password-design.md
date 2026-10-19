# Protected PDF Password Prompt Design

## Goal

Let a user unlock a password-protected bank statement by entering its password in ExtractMint, then continue the existing browser-only extraction and export flow.

## User experience

- When PDF.js requests a password, pause processing and show an inline password field in the progress area, alongside the affected filename.
- Use a masked input and an **Unlock & continue** action. Submit with Enter as well as the button.
- If PDF.js reports an incorrect password, keep the prompt open, clear the field, and show a short retry message.
- Provide **Cancel conversion** while waiting. Canceling destroys the pending PDF loading task, stops the current batch, and returns the progress area to a ready state with a “Conversion canceled” message.
- After a valid password, resume extraction, OCR if needed, and the remaining files in the batch.
- Reuse the unlocked PDF document already held in browser memory for the source preview. Do not ask the user to enter the password again just to review pages.

## Processing design

- Use PDF.js `PDFDocumentLoadingTask.onPassword` to detect both the initial password request and incorrect-password retries.
- Add a password-request callback to the converter options. The converter awaits that callback, supplies the value to PDF.js, and resumes the existing sequential processing loop.
- Keep prompt state in React memory only and clear the input after submission. The application code must not retain the raw password after handing it to PDF.js. Retain the loaded PDF document separately in memory for preview, without persisting either value.
- Do not write passwords to local storage, IndexedDB, telemetry, console output, diagnostics, review exports, or other generated files. Do not send them to a server.
- Keep the current unprotected-PDF path unchanged.

## Error handling and accessibility

- Incorrect passwords are retryable and are not reported as a generic conversion failure.
- Canceling does not leave the conversion spinner or password prompt active.
- Other PDF loading errors continue to use the existing error status and must not include the entered password.
- Give the input a visible label, associate retry feedback with it, focus it when the prompt appears, and ensure actions work with keyboard and screen readers.

## Acceptance criteria

1. A protected PDF pauses for a password and resumes extraction after a valid password.
2. An incorrect password leaves the user able to retry without re-uploading.
3. Canceling while the prompt is open ends the batch cleanly.
4. A successful protected-PDF conversion can use the source preview without a second password prompt.
5. The password is absent from persistent storage, analytics, logs, diagnostics, conversion results, and exports.
6. Unprotected PDFs and other supported input formats continue through their existing flow.

## Verification plan

- Add focused tests for PDF.js password requests, incorrect-password retries, cancellation, and continuation through a multi-file batch.
- Verify that password values never appear in analytics, diagnostics, exports, or stored browser data.
- Build the app and exercise a locally generated, synthetic password-protected statement in a browser, including preview and an export.

## Out of scope

- Uploading PDFs or passwords to a server for decryption.
- Remembering passwords across files, refreshes, or app sessions.
- Adding password support to non-PDF formats.
