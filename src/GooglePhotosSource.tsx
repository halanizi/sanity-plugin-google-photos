import {Box, Button, Card, Dialog, Flex, Spinner, Text} from '@sanity/ui'
import {useCallback, useEffect, useRef, useState} from 'react'
import type {AssetFromSource, AssetSourceComponentProps} from 'sanity'

import {
  clearCachedToken,
  getCachedToken,
  loadGoogleIdentity,
  requestAccessToken,
} from './googleAuth'
import {
  createSession,
  deleteSession,
  downloadAsFile,
  getSession,
  GoogleAuthError,
  listMediaItems,
  parseDuration,
} from './pickerApi'

export const SOURCE_NAME = 'google-photos'

export interface GooglePhotosSourceProps extends AssetSourceComponentProps {
  /** OAuth client ID (Web application) from Google Cloud */
  clientId: string
  /** Largest edge, in pixels, requested from Google */
  maxSize: number
}

type Status =
  | {step: 'signedOut'}
  | {step: 'ready'}
  | {step: 'picking'; pickerUri: string}
  | {step: 'importing'}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function GooglePhotosSource(props: GooglePhotosSourceProps) {
  const {onClose, onSelect, dialogHeaderTitle, clientId, maxSize} = props

  const [token, setToken] = useState<string | null>(() => getCachedToken())
  const [status, setStatus] = useState<Status>(() =>
    getCachedToken() ? {step: 'ready'} : {step: 'signedOut'},
  )
  const [error, setError] = useState<string | null>(null)
  const [gisLoaded, setGisLoaded] = useState(false)

  // Lets the polling loop stop when the dialog closes or the user cancels
  const cancelledRef = useRef(false)
  const sessionRef = useRef<{id: string; token: string} | null>(null)

  useEffect(() => {
    loadGoogleIdentity()
      .then(() => setGisLoaded(true))
      .catch((err: Error) => setError(err.message))
  }, [])

  const endSession = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    // Best effort: sessions also expire on their own
    if (session) deleteSession(session.token, session.id).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      endSession()
    }
  }, [endSession])

  const handleError = useCallback((err: unknown) => {
    if (err instanceof GoogleAuthError) {
      clearCachedToken()
      setToken(null)
      setStatus({step: 'signedOut'})
    } else {
      setStatus((current) => (current.step === 'signedOut' ? current : {step: 'ready'}))
    }
    setError(err instanceof Error ? err.message : String(err))
  }, [])

  const handleSignIn = useCallback(async () => {
    if (!clientId) return
    setError(null)
    try {
      setToken(await requestAccessToken(clientId))
      setStatus({step: 'ready'})
    } catch (err) {
      handleError(err)
    }
  }, [clientId, handleError])

  const handlePick = useCallback(async () => {
    if (!token) return
    setError(null)
    cancelledRef.current = false

    // Open the window now, while still inside the click, so the popup blocker allows it
    const pickerWindow = window.open('', 'google-photos-picker', 'width=1100,height=800')

    try {
      const session = await createSession(token)
      sessionRef.current = {id: session.id, token}
      // "/autoclose" makes Google close the picker window once a photo has been chosen
      const pickerUri = `${session.pickerUri}/autoclose`
      if (pickerWindow) pickerWindow.location.href = pickerUri
      setStatus({step: 'picking', pickerUri})

      // Poll until the user has finished picking, at the pace Google asks for
      let interval = parseDuration(session.pollingConfig?.pollInterval, 5000)
      const deadline = Date.now() + parseDuration(session.pollingConfig?.timeoutIn, 30 * 60_000)
      for (;;) {
        // Polling has to be sequential: each check waits for the previous one
        // oxlint-disable-next-line no-await-in-loop
        await wait(interval)
        if (cancelledRef.current) return
        // oxlint-disable-next-line no-await-in-loop
        const current = await getSession(token, session.id)
        if (current.mediaItemsSet) break
        interval = parseDuration(current.pollingConfig?.pollInterval, interval)
        if (Date.now() > deadline) throw new Error('Google Photos picking timed out. Try again.')
      }

      setStatus({step: 'importing'})
      const items = await listMediaItems(token, session.id)
      const photo = items.find((item) => item.type === 'PHOTO')
      if (!photo) throw new Error('That was not a photo. Videos cannot be used here.')

      const file = await downloadAsFile(token, photo, maxSize)
      if (cancelledRef.current) return
      endSession()

      // Sanity fills in the rest of the asset document (_id, url, metadata) when it uploads the file
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const assetDocumentProps = {
        _type: 'sanity.imageAsset',
        originalFilename: photo.mediaFile.filename,
        source: {name: SOURCE_NAME, id: photo.id},
      } as AssetFromSource['assetDocumentProps']

      const asset: AssetFromSource = {
        kind: 'file',
        // Sanity types `value` with its own File field type, but uploads expect a browser File
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        value: file as unknown as AssetFromSource['value'],
        assetDocumentProps,
      }
      onSelect([asset])
    } catch (err) {
      pickerWindow?.close()
      endSession()
      if (!cancelledRef.current) handleError(err)
    }
  }, [token, maxSize, onSelect, endSession, handleError])

  const handleCancelPicking = useCallback(() => {
    cancelledRef.current = true
    endSession()
    setStatus({step: 'ready'})
  }, [endSession])

  return (
    <Dialog
      id="google-photos-asset-source"
      header={dialogHeaderTitle ?? 'Select image from Google Photos'}
      onClose={onClose}
      open
      width={1}
    >
      <Box padding={4}>
        {/* Flex `gap` works in both @sanity/ui 3 and 4, unlike Stack's `space`/`gap` */}
        <Flex direction="column" gap={4}>
          {!clientId ? (
            <Text size={1}>
              Google Photos is not set up. Pass a Google OAuth <code>clientId</code> to the plugin
              in <code>sanity.config.ts</code>.
            </Text>
          ) : status.step === 'signedOut' ? (
            <>
              <Text size={1} muted>
                Sign in with Google to choose a photo from your library or albums.
              </Text>
              <Button
                text="Sign in with Google"
                tone="primary"
                onClick={handleSignIn}
                disabled={!gisLoaded}
                loading={!gisLoaded && !error}
              />
            </>
          ) : status.step === 'ready' ? (
            <>
              <Text size={1} muted>
                Google Photos opens in a new window. Browse your albums there and choose one photo.
              </Text>
              <Button text="Choose from Google Photos" tone="primary" onClick={handlePick} />
            </>
          ) : status.step === 'picking' ? (
            <>
              <Flex align="center" gap={3}>
                <Spinner muted />
                <Text size={1}>Waiting for you to choose a photo in Google Photos…</Text>
              </Flex>
              <Text size={1} muted>
                Window didn't open?{' '}
                <a href={status.pickerUri} target="_blank" rel="noreferrer">
                  Open Google Photos
                </a>
              </Text>
              <Button text="Cancel" mode="ghost" onClick={handleCancelPicking} />
            </>
          ) : (
            <Flex align="center" gap={3}>
              <Spinner muted />
              <Text size={1}>Importing photo…</Text>
            </Flex>
          )}

          {error && (
            <Card padding={3} radius={2} tone="critical" border>
              <Text size={1}>{error}</Text>
            </Card>
          )}
        </Flex>
      </Box>
    </Dialog>
  )
}
