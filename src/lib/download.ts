const exportFilters: Record<string, { name: string; extensions: string[] }> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { name: 'Excel workbook', extensions: ['xlsx'] },
  'text/csv': { name: 'CSV file', extensions: ['csv'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { name: 'Word document', extensions: ['docx'] },
  'application/pdf': { name: 'PDF document', extensions: ['pdf'] },
  'application/x-ofx': { name: 'QuickBooks file', extensions: ['qbo'] },
  'application/json': { name: 'JSON file', extensions: ['json'] },
  'application/zip': { name: 'ZIP archive', extensions: ['zip'] },
  'image/png': { name: 'PNG image', extensions: ['png'] },
}

/** Returns false when the native Save dialog is cancelled. */
export async function saveExport(blob: Blob, filename: string, mimeType: string): Promise<boolean> {
  if (import.meta.env.MODE === 'desktop') {
    try {
      const [{ save }, { writeFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ])
      const filter = exportFilters[mimeType.split(';')[0].trim()]
      const path = await save({
        title: 'Save export',
        defaultPath: filename,
        filters: filter ? [filter] : undefined,
      })
      if (path === null) return false

      // The Save dialog grants access to this selected file only.
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
      return true
    } catch {
      // Native errors can include local paths. Keep them out of UI and logs.
      throw new Error('Could not save the export. Choose another destination and try again.')
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    return true
  } finally {
    URL.revokeObjectURL(url)
  }
}
