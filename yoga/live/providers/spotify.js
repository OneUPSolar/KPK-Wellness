/**
 * providers/spotify.js — Spotify implementation of the MusicProvider contract.
 *
 * Only this file is allowed to talk to api.spotify.com.
 * The live session app talks to SpotifyProvider, never to Spotify directly.
 * See providers/README.md for the full provider contract.
 */

import { CONFIG } from '../config.js';

// --- PKCE helpers (private to this module) ---

function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function getToken() {
  return sessionStorage.getItem('spotify_access_token');
}

// --- Provider implementation ---

export const SpotifyProvider = {
  name: 'spotify',

  /**
   * Kick off the PKCE OAuth flow.
   * Redirects the browser to Spotify, then to /yoga/live/callback.html.
   */
  authenticate: async () => {
    const verifier = generateRandomString(128);
    sessionStorage.setItem('spotify_verifier', verifier);

    const challenge = await generateCodeChallenge(verifier);

    const args = new URLSearchParams({
      response_type:         'code',
      client_id:             CONFIG.spotify.clientId,
      scope:                 CONFIG.spotify.scopes.join(' '),
      redirect_uri:          CONFIG.spotify.redirectUri,
      code_challenge_method: 'S256',
      code_challenge:        challenge
    });

    window.location = `https://accounts.spotify.com/authorize?${args}`;
  },

  /**
   * Exchange the authorization code (from the callback URL) for an access token.
   * Called by callback.html after Spotify redirects back.
   */
  exchangeCode: async (code) => {
    const verifier = sessionStorage.getItem('spotify_verifier');

    const body = new URLSearchParams({
      client_id:     CONFIG.spotify.clientId,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  CONFIG.spotify.redirectUri,
      code_verifier: verifier
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status}`);

    const data = await res.json();
    sessionStorage.setItem('spotify_access_token', data.access_token);
    return data.access_token;
  },

  /** Returns true if the user has a stored access token. */
  isAuthenticated: () => Boolean(getToken()),

  /**
   * Search Spotify for playlists matching a mood + language.
   * Returns a normalised array so the UI never touches Spotify's raw shape.
   *
   * @param  {string} mood  e.g. 'grounding'
   * @param  {string} lang  'en' | 'es'
   * @returns {Promise<Array<{id, title, owner, coverUrl, externalUrl}>>}
   */
  searchPlaylistsByMood: async (mood, lang) => {
    const token = getToken();
    if (!token) return [];

    // Build a bilingual search term so results feel relevant in both languages
    const term = lang === 'es' ? `${mood} yoga relajación` : `${mood} yoga`;
    const query = encodeURIComponent(term);

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${query}&type=playlist&limit=3`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);

    const data = await res.json();

    // Normalise to the provider contract shape
    return (data.playlists?.items ?? [])
      .filter(Boolean)
      .map(pl => ({
        id:          pl.id,
        title:       pl.name,
        owner:       pl.owner?.display_name ?? '',
        coverUrl:    pl.images?.[0]?.url ?? '',
        externalUrl: pl.external_urls?.spotify ?? '#'
      }));
  },

  /**
   * Play a playlist on the user's active Spotify device.
   * Requires the 'streaming' scope and Spotify Premium.
   * Phase 1: just opens the playlist in Spotify Web.
   * Phase 2+: use the Web Playback SDK to drive in-page playback.
   *
   * @param {string} playlistId
   */
  play: async (playlistId) => {
    // Phase 1: delegate to Spotify's own player
    window.open(`https://open.spotify.com/playlist/${playlistId}`, '_blank');
    // Phase 2 TODO: POST to /me/player/play with Web Playback SDK device_id
  },

  /** Pause playback. Phase 2+: call Web Playback SDK. */
  pause: async () => {
    // Phase 2 TODO: Web Playback SDK pause()
    console.info('[SpotifyProvider] pause() not yet implemented — Phase 2');
  }
};
