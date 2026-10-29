import type {AssetSource, AssetSourceComponentProps} from 'sanity'

import {GooglePhotosSource, SOURCE_NAME} from './GooglePhotosSource'
import {DEFAULT_MAX_SIZE} from './pickerApi'

/** @public */
export interface GooglePhotosConfig {
  /**
   * OAuth client ID (type "Web application") from Google Cloud, ending in `.apps.googleusercontent.com`.
   * Its authorized JavaScript origins must include every URL your Studio runs on.
   */
  clientId: string
  /**
   * Largest edge, in pixels, of the imported photo. Defaults to 4000.
   * Google returns resized photos as JPEG, so HEIC photos from iPhones import fine.
   */
  maxSize?: number
}

/** Generic "photos" icon, drawn in the style of @sanity/icons */
function GooglePhotosIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 25 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5.5 7.5h14v11h-14zM5.5 15.5l4-4 3 3 2-2 5 4.5M15.5 10.5a1 1 0 100-2 1 1 0 000 2z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The Google Photos asset source on its own, for Studios that arrange `form.image.assetSources` themselves.
 *
 * ```ts
 * form: {
 *   image: {
 *     assetSources: (prev) => [...prev, googlePhotosAssetSource({clientId: '…'})],
 *   },
 * }
 * ```
 *
 * @public
 */
export function googlePhotosAssetSource(config: GooglePhotosConfig): AssetSource {
  const {clientId, maxSize = DEFAULT_MAX_SIZE} = config
  function GooglePhotosAssetSource(props: AssetSourceComponentProps) {
    return <GooglePhotosSource {...props} clientId={clientId} maxSize={maxSize} />
  }

  return {
    name: SOURCE_NAME,
    // A plain title is still supported; i18nKey would need a locale bundle for one English string
    // oxlint-disable-next-line typescript/no-deprecated
    title: 'Google Photos',
    icon: GooglePhotosIcon,
    component: GooglePhotosAssetSource,
  }
}
