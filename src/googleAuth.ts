/**
 * Google sign-in for the Photos Picker API, using Google Identity Services (GIS) in the browser.
 * Access tokens live in memory only, so a page reload asks Google again (usually without a prompt).
 */

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const PICKER_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'

// Minimal typing for the parts of GIS used here
interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken: (overrides?: {prompt?: string}) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: {type: string; message?: string}) => void
          }) => TokenClient
        }
      }
    }
  }
}

let scriptPromise: Promise<void> | null = null
let cachedToken: {value: string; expiresAt: number} | null = null

/** Loads the GIS script once. Call it early so sign-in can open its popup straight from a click. */
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GIS_SCRIPT_URL
      script.async = true
      script.addEventListener('load', () => resolve(), {once: true})
      script.addEventListener(
        'error',
        () => {
          scriptPromise = null
          reject(new Error('Could not load Google sign-in'))
        },
        {once: true},
      )
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/** Returns a still-valid token from this session, if there is one */
export function getCachedToken(): string | null {
  // Treat tokens as expired a minute early, so one never runs out mid-request
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value
  return null
}

export function clearCachedToken() {
  cachedToken = null
}

/**
 * Opens Google's sign-in popup and resolves with an access token.
 * Must be called from a click handler, after loadGoogleIdentity() has resolved, or the popup is blocked.
 */
export function requestAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2
    if (!oauth2) {
      reject(new Error('Google sign-in has not loaded yet'))
      return
    }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: PICKER_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google sign-in failed'))
          return
        }
        cachedToken = {
          value: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        }
        resolve(response.access_token)
      },
      error_callback: (error) => {
        // Fires when the popup is closed or blocked
        reject(new Error(error.message || `Google sign-in was cancelled (${error.type})`))
      },
    })
    // An empty prompt skips the consent screen when it has already been granted
    client.requestAccessToken({prompt: ''})
  })
}
