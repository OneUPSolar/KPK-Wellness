# School of Open Yoga (`/yoga`)

The flagship bilingual digital experience for KPK Wellness Associates' yoga instruction, built with vanilla web technologies, the Web Speech API, and Spotify OAuth.

## Quick Start (Local Development)

1. Open this repository in VS Code.
2. Install the **Live Server** extension by Ritwick Dey.
3. Click "Go Live" in the status bar (ensuring it runs on `http://127.0.0.1:5500`).
4. Navigate to `http://127.0.0.1:5500/yoga/` to view the landing page.

## Configuration Guide

### 1. Spotify Integration
To enable the mood-based playlist suggestions in the live session:
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).
2. Create a new App.
3. In the App settings, add the following Redirect URIs exactly:
   - `http://127.0.0.1:5500/yoga/live/callback.html` (for local testing)
   - `https://kpk.associates/yoga/live/callback.html` (for production)
4. Copy your **Client ID** (you do not need the Client Secret).
5. Open `yoga/live/index.html` and replace `YOUR_SPOTIFY_CLIENT_ID` on line 53.
6. Open `yoga/live/callback.html` and replace `YOUR_SPOTIFY_CLIENT_ID` on line 14.

### 2. WhatsApp Contact Number
1. Open `yoga/nav.js`.
2. Update the `WHATSAPP_NUMBER` constant on line 4 with Karina's Business Number in international format (e.g., `526643640788`).

### 3. Translations (English / Spanish)
All UI text is controlled via a single source of truth.
1. Open `yoga/i18n.js`.
2. Add or edit keys within the `i18n` object.
3. To apply a translation to an HTML element, give it a `data-i18n="yourKeyName"` attribute.

### 4. Mood Detection & Keyword Mapping
The live app listens to the instructor's voice and matches keywords to moods.
1. Open `yoga/live/index.html`.
2. Locate the `moodMap` object on line 59.
3. To expand the vocabulary, simply add new phrases to the English (`en`) or Spanish (`es`) arrays under the desired mood.
4. When a keyword is spoken, the app searches Spotify for `[mood] yoga` playlists.

## Deployment

This site is hosted on **Cloudflare Pages**.
- The platform automatically deploys from the `main` branch on GitHub.
- Once you commit and push these changes (`git push origin main`), the new `/yoga/` section will be live at `https://kpk.associates/yoga/` within minutes.
