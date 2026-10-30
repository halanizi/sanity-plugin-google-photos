# sanity-plugin-google-photos

[![npm version](https://img.shields.io/npm/v/sanity-plugin-google-photos.svg)](https://www.npmjs.com/package/sanity-plugin-google-photos)

Pick photos from Google Photos, including your albums, in Sanity Studio image fields.

The plugin adds **Google Photos** to the image field's **Select** menu. You sign in with Google, choose a photo in Google's own picker, and the photo is uploaded into your dataset as a normal Sanity image asset. Your frontend doesn't need any changes.

It uses the [Google Photos Picker API](https://developers.google.com/photos/picker), which is the only way Google currently lets third-party apps access a user's photos.

## Requirements

- Sanity Studio v5 or v6
- A Google OAuth client ID that you create yourself (free, about 10 minutes; see [Google setup](#google-setup))

## Installation

```sh
npm install sanity-plugin-google-photos
```

## Usage

Add the plugin in `sanity.config.ts`:

```ts
import {defineConfig} from 'sanity'
import {googlePhotosImageAsset} from 'sanity-plugin-google-photos'

export default defineConfig({
  // ...
  plugins: [
    googlePhotosImageAsset({
      clientId: process.env.SANITY_STUDIO_GOOGLE_CLIENT_ID!,
    }),
  ],
})
```

Then add the client ID to your Studio's `.env`:

```env
SANITY_STUDIO_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

The client ID is a public value, so it's safe in the Studio bundle. Don't put the client secret anywhere; the plugin doesn't use it.

### Options

| Option     | Type     | Default  | Description                                                                                                           |
| ---------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `clientId` | `string` | required | OAuth client ID (type "Web application") from Google Cloud.                                                           |
| `maxSize`  | `number` | `4000`   | Largest edge, in pixels, of the imported photo. Photos come back as JPEG, so iPhone HEIC photos import without issue. |

### Choosing where it appears in the menu

The plugin adds Google Photos to the end of the image sources. To control the order yourself, use the asset source directly instead of the plugin:

```ts
import {googlePhotosAssetSource} from 'sanity-plugin-google-photos'

export default defineConfig({
  // ...
  form: {
    image: {
      assetSources: (previousAssetSources) => [
        googlePhotosAssetSource({clientId: process.env.SANITY_STUDIO_GOOGLE_CLIENT_ID!}),
        ...previousAssetSources,
      ],
    },
  },
})
```

## Google setup

You do this once. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with the Google account that owns your photos.

### 1. Create a project

1. Click the project dropdown at the top left, then **New project**.
2. Name it something like `my-website-studio` and click **Create**.
3. Make sure it's selected in the dropdown.

### 2. Enable the Photos Picker API

Go to **APIs & Services → Library**, search for "Photos Picker API", and click **Enable**.

> **Note:** Choose **Photos Picker API**, not "Photos Library API". The Library API no longer allows reading your photos.

### 3. Set up the consent screen

This is what you see when you sign in. Go to **APIs & Services → OAuth consent screen** (which Google now calls "Google Auth Platform") and click **Get started**:

- **App information:** give it a name, e.g. _My Website Studio_, and use your email as the support email.
- **Audience:** choose **External**.
- **Contact info:** your email. Agree to the policy and click **Create**.

Then:

- Under **Audience → Test users**, click **Add users** and add the Google account of everyone who will use the Studio. Leave the app in **Testing**. Only accounts you add can sign in, and you never need Google's verification review.
- Under **Data Access → Add or remove scopes**, add:

  ```
  https://www.googleapis.com/auth/photospicker.mediaitems.readonly
  ```

  You may need to paste it in the "manually add scopes" box. Click **Save**.

### 4. Create the OAuth client

1. Go to **Clients** (or **APIs & Services → Credentials**), then **Create client**, and choose type **Web application**.
2. Under **Authorized JavaScript origins**, add every URL your Studio runs on, for example:
   - `http://localhost:3333`
   - `https://<your-studio-host>.sanity.studio`
3. Leave **Authorized redirect URIs** empty. The sign-in popup doesn't need one.
4. Click **Create** and copy the **Client ID**, which ends in `.apps.googleusercontent.com`.

### 5. Add it to the Studio

Put the client ID in your `.env` as shown in [Usage](#usage) and restart the Studio. If you deploy with `sanity deploy` from your machine, `.env` is picked up at build time. If you build somewhere else (CI, Vercel, etc.), set the variable there too.

> The first time you sign in, Google will show **"Google hasn't verified this app."** That's expected for a Testing-mode app. Click **Continue**.

## How it works

1. You sign in with Google in a popup (Google Identity Services). The access token is kept in memory only. Nothing is stored in the browser or the dataset.
2. The plugin starts a Picker session and opens Google Photos in a new window, where you can browse your library and albums.
3. Once you choose a photo, the window closes, and the plugin downloads the photo and hands it to Sanity, which uploads it like any other image.

Imported assets are tagged with `source.name: "google-photos"` and the Google media item ID, plus the original filename, so you can find them later, e.g. in [sanity-plugin-media](https://www.sanity.io/plugins/sanity-plugin-media).

## Limitations

These come from Google's API, not the plugin:

- **One photo at a time.** A Sanity image field holds one image, so the picker is limited to one.
- **No album syncing.** Google no longer lets apps list an album's contents. You can browse albums inside the picker, but you can't connect an album and have it update automatically.
- **Photos only.** Videos are rejected with a message.
- **Popups must be allowed.** Sign-in and the picker each open a window. If the picker window is blocked, the dialog shows a link to open it.

## Troubleshooting

| Problem                                                                       | Fix                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| "Google Photos is not set up"                                                 | `clientId` is empty. Check the env variable name and restart the Studio.                                           |
| Sign-in popup shows `Error 400: origin_mismatch` (or `redirect_uri_mismatch`) | The Studio's URL isn't in the client's **Authorized JavaScript origins**. Changes can take a few minutes to apply. |
| `Error 403: access_denied`                                                    | Your Google account isn't a test user on the consent screen.                                                       |
| "Your Google sign-in has expired"                                             | Tokens last about an hour. Sign in again.                                                                          |

## License

[MIT](LICENSE) © Hanna Alanizi

## Develop & test

This plugin uses [@sanity/plugin-kit](https://github.com/sanity-io/plugins/tree/main/packages/@sanity/plugin-kit)
with default configuration for build & watch scripts.

See [Testing a plugin in Sanity Studio](https://github.com/sanity-io/plugins/tree/main/packages/@sanity/plugin-kit#testing-a-plugin-in-sanity-studio)
on how to run this plugin with hotreload in the studio.
