type PdfPasswordTask = {
  onPassword: ((updatePassword: (password: string) => void, reason: number) => void) | null
  destroy: () => Promise<unknown> | unknown
}

export function attachPdfPasswordPrompt(
  task: PdfPasswordTask,
  requestPassword: (reason: 'required' | 'incorrect') => Promise<string>,
  passwordResponses: { INCORRECT_PASSWORD: number },
): () => void
