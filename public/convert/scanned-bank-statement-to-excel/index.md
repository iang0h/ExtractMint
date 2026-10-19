# Scanned Bank Statement to Excel with OCR

> Turn a scanned statement PDF or image into transaction rows in your browser. Review every date, amount, and balance against the original before using or exporting the result.

## When to use OCR

Use this workflow for a statement that is a scan, a photo, or a PDF with no selectable text. A text-based PDF may be extracted directly and usually avoids OCR-related character errors; see the [PDF statement to Excel guide](https://extractmint.iangoh.com/convert/pdf-bank-statement-to-excel/).

## How OCR works in ExtractMint

- **PDFs:** ExtractMint first reads selectable PDF text. If the text is sparse, it automatically renders and OCRs the pages in your browser.
- **Force OCR:** Turn on **Force OCR (scanned PDFs)** in the converter to OCR every page of a PDF, including one that already contains selectable text. This can help when the embedded text is incomplete or garbled.
- **Images:** Supported image files are sent through OCR directly; the Force OCR setting is for PDFs.
- **OCR language:** Choose English, Malay, Indonesian, or Chinese (Simplified) in the converter. Select the language used in the statement. Mixed-language content, abbreviations, and small text may still be misread.

OCR recognizes text; it does not guarantee that each number or transaction is correct.

## Prepare a better scan

- Use a sharp, high-resolution scan or original PDF.
- Keep the page straight, evenly lit, and fully inside the frame.
- Avoid blur, glare, shadows, strong compression, and handwriting across the table.
- Make sure transaction dates, descriptions, amount columns, and balance figures are legible.

## Review before export

Compare extracted rows with the statement, paying particular attention to:

1. **Dates:** Check the day/month order and statement period.
2. **Amounts:** Check decimal separators, minus signs, and amounts written in parentheses.
3. **Debit and credit:** Confirm withdrawals and deposits are in the correct columns and direction.
4. **Balances:** Compare opening and closing balances, transaction totals, and running balances. Balance checks can surface discrepancies; they cannot certify OCR accuracy.
5. **Page breaks:** Look for missing, duplicated, or split transactions where one page ends and the next begins.
6. **Descriptions and references:** Spot-check text that may affect matching or bookkeeping.

Correct rows in the converter before downloading. Available exports include Excel XLSX, CSV, DOCX, PDF, QBO, review JSON, review-pack ZIP, and a combined workbook.

## Privacy and processing

In the current static build, core file reading, PDF OCR, image OCR, and row extraction run in your browser. If enabled, **Persist OCR cache** and **Persist PDF review index** store derived text in this browser for repeat work; the converter can clear these caches. If you use the optional assistant, your question, file name, document details, and up to five extracted rows are sent to its endpoint, and a configured AI provider may receive that context. The original PDF is not sent by that assistant request. Read the [privacy details](https://extractmint.iangoh.com/privacy/).

## Bank-format limitations

Bank statement layouts vary. No bank-specific format has been independently validated against real statements, and supported OCR languages do not imply bank coverage or guaranteed accuracy. Check each converted file against its original statement before relying on it.

## Related guides

- [Bank statement to Excel](https://extractmint.iangoh.com/convert/bank-statement-to-excel/)
- [PDF bank statement to Excel](https://extractmint.iangoh.com/convert/pdf-bank-statement-to-excel/)
- [Open the ExtractMint converter](https://extractmint.iangoh.com/#converter)
- [Privacy details](https://extractmint.iangoh.com/privacy/)
