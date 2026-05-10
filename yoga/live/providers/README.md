# Music Provider Contract

A **music provider** is any object that exposes the following interface, allowing the live session app to swap between Spotify, Apple Music, Tidal, or any future service without touching the UI code.

## Required Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `authenticate` | `async () => void` | — | Initiates the auth flow (OAuth redirect, popup, etc.). Provider is responsible for storing the resulting credential. |
| `exchangeCode` | `async (code: string) => string` | access token | Exchanges an auth code for an access token and persists it. Called from `callback.html`. |
| `isAuthenticated` | `() => boolean` | — | Returns `true` if a valid credential is currently stored. |
| `searchPlaylistsByMood` | `async (mood: string, lang: string) => Playlist[]` | — | Searches for playlists. `mood` is a key from `yogaMoodMap` (e.g. `'grounding'`). `lang` is `'en'` or `'es'`. |
| `play` | `async (playlistId: string) => void` | — | Starts playback of the given playlist. |
| `pause` | `async () => void` | — | Pauses current playback. |

## Playlist Object Shape

Every `Playlist` returned from `searchPlaylistsByMood` must conform to:

```js
{
  id:          string,  // provider-internal playlist ID
  title:       string,  // display name
  owner:       string,  // creator/curator name
  coverUrl:    string,  // URL to the cover image
  externalUrl: string   // link to open the playlist in the provider's own app/web
}
```

## Adding a New Provider

1. Create `providers/your-provider.js`.
2. Export an object (or class instance) implementing all six methods above.
3. In `app.js`, swap the import line:
   ```js
   // Before
   import { SpotifyProvider as MusicProvider } from './providers/spotify.js';
   // After
   import { AppleMusicProvider as MusicProvider } from './providers/apple-music.js';
   ```
4. The rest of the app needs zero changes.
