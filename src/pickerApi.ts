/**
 * Thin client for the Google Photos Picker API.
 * Docs: https://developers.google.com/photos/picker/reference/rest
 */

const API_URL = 'https://photospicker.googleapis.com/v1'

// Default largest edge requested from Google. Resized downloads come back as JPEG, which also covers HEIC photos.
export const DEFAULT_MAX_SIZE = 4000

export interface PickingSession {
  id: string
  pickerUri: string
  mediaItemsSet?: boolean
  expireTime?: string
  pollingConfig?: {
    pollInterval?: string
    timeoutIn?: string
  }
}

export interface PickedMediaItem {
  id: string
  createTime?: string
  type: 'TYPE_UNSPECIFIED' | 'PHOTO' | 'VIDEO'
  mediaFile: {
    baseUrl: string
    mimeType: string
    filename: string
    mediaFileMetadata?: {
      width?: number
      height?: number
    }
  }
}

/** Raised when Google rejects the token, so the caller can ask the user to sign in again */
export class GoogleAuthError extends Error {}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_URL}${path}`, {...init, headers})
  if (response.status === 401) {
    throw new GoogleAuthError('Your Google sign-in has expired')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message || `Google Photos request failed (${response.status})`)
  }
  // DELETE returns an empty body
  const text = await response.text()
  // Response shapes come from Google's API reference, so they are trusted rather than validated
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (text ? JSON.parse(text) : {}) as T
}

/** Starts a picking session limited to one item, since a Sanity image field holds one image */
export function createSession(token: string): Promise<PickingSession> {
  return request(token, '/sessions', {
    method: 'POST',
    body: JSON.stringify({pickingConfig: {maxItemCount: '1'}}),
  })
}

export function getSession(token: string, sessionId: string): Promise<PickingSession> {
  return request(token, `/sessions/${encodeURIComponent(sessionId)}`)
}

export async function deleteSession(token: string, sessionId: string): Promise<void> {
  await request(token, `/sessions/${encodeURIComponent(sessionId)}`, {method: 'DELETE'})
}

export async function listMediaItems(token: string, sessionId: string): Promise<PickedMediaItem[]> {
  const items: PickedMediaItem[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({sessionId, pageSize: '100'})
    if (pageToken) params.set('pageToken', pageToken)
    // Pages are fetched in order: each one gives the token for the next
    // oxlint-disable-next-line no-await-in-loop
    const page = await request<{mediaItems?: PickedMediaItem[]; nextPageToken?: string}>(
      token,
      `/mediaItems?${params}`,
    )
    items.push(...(page.mediaItems ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)
  return items
}

/** Converts Google's duration strings, such as "5s" or "1.5s", to milliseconds */
export function parseDuration(value: string | undefined, fallbackMs: number): number {
  const seconds = value ? parseFloat(value) : NaN
  return Number.isFinite(seconds) ? seconds * 1000 : fallbackMs
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Downloads a picked photo as a File that Sanity can upload */
export async function downloadAsFile(
  token: string,
  item: PickedMediaItem,
  maxSize = DEFAULT_MAX_SIZE,
): Promise<File> {
  const {baseUrl, filename, mediaFileMetadata} = item.mediaFile
  const width = Math.min(mediaFileMetadata?.width || maxSize, maxSize)
  const height = Math.min(mediaFileMetadata?.height || maxSize, maxSize)

  const response = await fetch(`${baseUrl}=w${width}-h${height}`, {
    headers: {Authorization: `Bearer ${token}`},
  })
  if (response.status === 401 || response.status === 403) {
    throw new GoogleAuthError('Google refused the photo download. Try signing in again.')
  }
  if (!response.ok) {
    throw new Error(`Could not download the photo from Google Photos (${response.status})`)
  }

  const blob = await response.blob()
  const type = blob.type || 'image/jpeg'
  // Match the extension to what Google actually sent, e.g. IMG_1234.HEIC becomes IMG_1234.jpg
  const extension = EXTENSIONS[type] ?? 'jpg'
  const baseName = filename.replace(/\.[^.]+$/, '') || 'google-photo'
  return new File([blob], `${baseName}.${extension}`, {type})
}
