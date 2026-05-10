/**
 * modules/ui.js — All DOM mutations for the live session app.
 *
 * No business logic lives here. This module only reads from the DOM
 * and writes to it. All other modules call these functions instead of
 * manipulating the DOM themselves.
 */

// --- Element references (resolved once at import time) ---
const transcriptStream  = document.getElementById('transcriptStream');
const moodIndicatorEl   = document.getElementById('moodIndicator');
const sessionToggleBtn  = document.getElementById('sessionToggle');
const sessionBtnText    = document.getElementById('btnText');
const spotifyConnectBtn = document.getElementById('spotifyConnectBtn');
const playlistContainer = document.getElementById('playlistContainer');


// --- Transcript ---

/**
 * Append a finalised transcript line to the scrolling panel.
 * @param {string} highlightedHtml  HTML string (keywords already wrapped by moodDetector)
 */
export function appendTranscriptLine(highlightedHtml) {
  const div = document.createElement('div');
  div.className = 'transcript-line';
  div.innerHTML = highlightedHtml;
  transcriptStream.appendChild(div);
  transcriptStream.scrollTop = transcriptStream.scrollHeight;
}

/**
 * Show an error/status message inside the transcript panel.
 * @param {string} message  Plain text message.
 */
export function showTranscriptStatus(message) {
  const p = document.createElement('p');
  p.style.color      = 'var(--ink-dim)';
  p.style.fontFamily = 'var(--font-mono)';
  p.style.fontSize   = '0.85rem';
  p.textContent = message;
  transcriptStream.appendChild(p);
}


// --- Mood indicator ---

/** @param {string} moodKey  e.g. 'grounding' */
export function showMood(moodKey) {
  moodIndicatorEl.textContent = moodKey.toUpperCase();
  moodIndicatorEl.classList.add('active');
}

export function hideMood() {
  moodIndicatorEl.classList.remove('active');
}


// --- Session button ---

/** Switch the button to its "recording" visual state. */
export function setSessionActive(stopLabel) {
  sessionToggleBtn.classList.add('recording');
  sessionBtnText.textContent = stopLabel;
}

/** Switch the button back to its idle state. */
export function setSessionIdle(startLabel) {
  sessionToggleBtn.classList.remove('recording');
  sessionBtnText.textContent = startLabel;
}


// --- Spotify connect button ---

/** Hide the Connect Spotify button and show a connected message. */
export function showSpotifyConnected(message) {
  spotifyConnectBtn.style.display = 'none';
  const p = document.createElement('p');
  p.style.fontFamily = 'var(--font-mono)';
  p.style.fontSize   = '0.8rem';
  p.style.color      = 'var(--ink-dim)';
  p.textContent = message;
  playlistContainer.prepend(p);
}


// --- Playlist cards ---

/**
 * Render a list of normalised playlist objects.
 * @param {Array<{id, title, owner, coverUrl, externalUrl}>} playlists
 */
export function renderPlaylists(playlists) {
  playlistContainer.innerHTML = '';

  if (!playlists.length) {
    playlistContainer.innerHTML = '<p style="font-family:var(--font-mono);font-size:0.8rem;color:var(--ink-dim);">No playlists found.</p>';
    return;
  }

  playlists.forEach(pl => {
    const coverImg = pl.coverUrl
      ? `<img src="${pl.coverUrl}" class="playlist-img" alt="Cover">`
      : '';

    playlistContainer.insertAdjacentHTML('beforeend', `
      <a href="${pl.externalUrl}" target="_blank" class="playlist-card">
        ${coverImg}
        <div class="playlist-info">
          <h4>${pl.title}</h4>
          <p>${pl.owner}</p>
        </div>
      </a>
    `);
  });
}

/**
 * Show a text-only status in the playlist panel.
 * @param {string} message
 */
export function showPlaylistStatus(message) {
  playlistContainer.innerHTML =
    `<p style="font-family:var(--font-mono);font-size:0.8rem;color:var(--ink-dim);">${message}</p>`;
}
