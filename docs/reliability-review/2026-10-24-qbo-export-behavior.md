# QBO string handling in this review

ExtractMint currently emits OFX 1.0.2 SGML (`VERSION:102`). This describes the file format produced by the app; it does not establish that QuickBooks or another importer accepts every file.

The official OFX 1.0.2 specification defines transaction `NAME` and `REFNUM` as at most 32 characters and `MEMO` as at most 255. It requires special SGML escapes for `<`, `>`, and `&`. The current specification files are linked from the [FDX OFX Work Group page](https://financialdataexchange.org/about-fdx/ofx-work-group/); its [OFX 1.0.2 specification package](https://financialdataexchange.org/wp-content/uploads/2025/12/ofx1.0.2spec.zip) contains the source DTDs and specification documents.

Current handling is explicit:

- `NAME` contains the first 32 characters. The complete description is also written to `MEMO`.
- `REFNUM` contains a reference up to 32 characters. A longer reference is written in full to `MEMO` instead of being cut off.
- `MEMO` includes source line numbers. If all memo content would exceed 255 characters, QBO export stops with an explanation; it does not truncate text.
- `<`, `>`, and `&` are escaped according to OFX 1.0.2 SGML rules.
- QBO output declares `USASCII`. Non-ASCII text is rejected with guidance to use CSV or Excel, rather than being silently replaced. QBO fields also normalize repeated whitespace to a single space.

The regression suite checks field boundaries, SGML escaping, long descriptions and references, memo overflow, non-ASCII rejection, source-line retention, and equality of transaction dates and amounts with the on-screen rows. It does not import files into QuickBooks. CSV and XLSX content are tested locally; external accounting-software acceptance remains unverified.
