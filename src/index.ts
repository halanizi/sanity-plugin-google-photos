import {definePlugin} from 'sanity'

import {googlePhotosAssetSource, type GooglePhotosConfig} from './assetSource'

export {googlePhotosAssetSource, type GooglePhotosConfig}

/**
 * Adds Google Photos to the image picker of every image field.
 *
 * ```ts
 * import {googlePhotosImageAsset} from 'sanity-plugin-google-photos'
 *
 * export default defineConfig({
 *   plugins: [googlePhotosImageAsset({clientId: process.env.SANITY_STUDIO_GOOGLE_CLIENT_ID!})],
 * })
 * ```
 *
 * @public
 */
export const googlePhotosImageAsset = definePlugin<GooglePhotosConfig>((config) => {
  const source = googlePhotosAssetSource(config)
  return {
    name: 'sanity-plugin-google-photos',
    form: {
      image: {
        assetSources: (previousAssetSources) => [
          ...previousAssetSources.filter(({name}) => name !== source.name),
          source,
        ],
      },
    },
  }
})
