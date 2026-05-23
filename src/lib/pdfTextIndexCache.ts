type PdfTextIndexRecord = {
  key: string
  rawText: string
  normalizedText: string
  updatedAt: number
  size: number
}

const DB_NAME = 'extractmint'
const OCR_STORE_NAME = 'ocrTextCache'
const STORE_NAME = 'pdfPageTextCache'
const DB_VERSION = 2

let openPromise: Promise<IDBDatabase> | undefined

function openDb(): Promise<IDBDatabase> {
  if (openPromise) return openPromise
  openPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(OCR_STORE_NAME)) {
        db.createObjectStore(OCR_STORE_NAME, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
  return openPromise
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
    request.onsuccess = () => resolve(request.result)
  })
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

export async function getPersistentPdfPageText(
  key: string,
): Promise<{ rawText: string; normalizedText: string } | undefined> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const record = await requestToPromise<PdfTextIndexRecord | undefined>(store.get(key))
    await txDone(tx)
    if (!record) return undefined
    return { rawText: record.rawText, normalizedText: record.normalizedText }
  } catch {
    return undefined
  }
}

export async function setPersistentPdfPageText(key: string, rawText: string, normalizedText: string) {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const size = new TextEncoder().encode(`${rawText}\n${normalizedText}`).byteLength
    const record: PdfTextIndexRecord = { key, rawText, normalizedText, updatedAt: Date.now(), size }
    store.put(record)
    await txDone(tx)
  } catch {
    // best-effort only
  }
}

export async function clearPersistentPdfTextIndex() {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    await txDone(tx)
  } catch {
    // best-effort only
  }
}

export async function getPersistentPdfTextIndexStats(): Promise<{ entries: number; bytes: number }> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const entries = await requestToPromise<number>(store.count())
    const records = await requestToPromise<PdfTextIndexRecord[]>(store.getAll())
    await txDone(tx)
    const bytes = records.reduce((sum, record) => sum + (record?.size ?? 0), 0)
    return { entries, bytes }
  } catch {
    return { entries: 0, bytes: 0 }
  }
}

