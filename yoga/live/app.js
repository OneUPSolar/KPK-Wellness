/**
 * app.js — Entry point. Wires all modules together.
 *
 * This file's only job is dependency injection and event wiring.
 * No business logic lives here — it's just connections.
 *
 * Phase 3 SaaS: instructor auth, multi-tenant config, and billing
 * will plug in via CONFIG.features flags — no feature code changes needed.
 */

import { CONFIG }           from './config.js';
import { SpotifyProvider }  from './providers/spotify.js';
import { createTranscription } from './modules/transcription.js';
import { detectMood }       from './modules/moodDetector.js';
import { createAudioViz }   from './modules/audioViz.js';
import { createSession }    from './modules/session.js';
import * as ui              from './modules/ui.js';

// --- Language helper (reads from localStorage, set by nav.js) ---
const getLang = () => localStorage.getItem('yoga_lang') || 'en';

// --- Music provider alias.
// To switch providers, change only this import line.
const MusicProvider = SpotifyProvider;

// Track the most recently detected mood to avoid duplicate fetches
let currentMood = null;

// --- Transcription subsystem ---
const transcription = createTranscription({
  isEnabled: CONFIG.features.transcription,

  onFinalResult(text) {
    if (!CONFIG.features.moodDetection) {
      ui.appendTranscriptLine(text);
      return;
    }

    const lang = getLang();
    const { mood, highlightedHtml } = detectMood(text, lang);

    // Push the annotated line to the transcript panel
    ui.appendTranscriptLine(highlightedHtml);

    // If mood changed and Spotify is enabled, fetch new playlists
    if (
      CONFIG.features.spotifyMusic &&
      mood &&
      mood !== currentMood &&
      MusicProvider.isAuthenticated()
    ) {
      currentMood = mood;
      ui.showMood(mood);
      MusicProvider.searchPlaylistsByMood(mood, lang)
        .then(playlists => ui.renderPlaylists(playlists))
        .catch(err => {
          console.error('[app] Playlist fetch failed:', err);
          ui.showPlaylistStatus(window.i18n?.spotifyError?.[getLang()] ?? 'Could not load playlists.');
        });
    }
  },

  onError(errCode) {
    if (errCode === 'not-allowed') {
      ui.showTranscriptStatus('Microphone access denied. Please allow mic access and refresh.');
      session.stop();
    }
  }
});

// --- Audio visualizer ---
const viz = createAudioViz(
  document.querySelectorAll('.audio-bar')
);

// --- Session state machine ---
const session = createSession({
  transcription,
  viz,
  ui,
  i18n:    window.i18n,
  getLang
});

// --- Wire session toggle button ---
document.getElementById('sessionToggle')
  .addEventListener('click', () => session.toggle());

// --- Spotify: wire connect button and check existing auth ---
if (CONFIG.features.spotifyMusic) {
  const connectBtn = document.getElementById('spotifyConnectBtn');

  if (MusicProvider.isAuthenticated()) {
    ui.showSpotifyConnected(
      window.i18n?.spotifyConnected?.[getLang()] ?? 'Spotify connected. Start session to see music.'
    );
  } else {
    connectBtn.addEventListener('click', () => MusicProvider.authenticate());
  }
}

// --- Transcription not supported fallback ---
if (!transcription.isSupported) {
  ui.showTranscriptStatus(
    'Speech recognition is not supported in this browser. Please use Chrome or Edge.'
  );
}
