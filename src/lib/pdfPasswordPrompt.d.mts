type PdfPasswordTask = {
  // PDF.js declares this as Function; the adapter only assigns its callback.
  onPassword: unknown
  destroy: () => Promise<unknown> | unknown
}

export function attachPdfPasswordPrompt(
  task: PdfPasswordTask,
  requestPassword: (reason: 'required' | 'incorrect') => Promise<string>,
  passwordResponses: { INCORRECT_PASSWORD: number },
): () => void
