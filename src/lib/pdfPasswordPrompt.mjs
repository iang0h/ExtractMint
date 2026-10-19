export function attachPdfPasswordPrompt(task, requestPassword, passwordResponses) {
  let active = true
  task.onPassword = (updatePassword, reason) => {
    void Promise.resolve()
      .then(() => requestPassword(reason === passwordResponses.INCORRECT_PASSWORD ? 'incorrect' : 'required'))
      .then(
        (password) => {
          if (active) updatePassword(password)
        },
        () => {
          if (!active) return
          active = false
          void Promise.resolve().then(() => task.destroy()).catch(() => {})
        },
      )
  }

  return () => {
    active = false
  }
}
