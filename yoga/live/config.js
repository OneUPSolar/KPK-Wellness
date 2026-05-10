/**
 * config.js — Single source of truth for all configurable values.
 * Every other module imports from here. Nothing else should hardcode
 * credentials, URLs, or feature flags.
 *
 * Phase 3 SaaS: instructor auth, multi-tenant config, and billing
 * will plug in via CONFIG.features flags — no feature code changes needed.
 */

export const CONFIG = {
  spotify: {
    clientId: '16a8fc5876aa41b596b9041c69048199',
    redirectUri: window.location.origin + '/yoga/live/callback.html',
    scopes: [
      'playlist-read-private',
      'user-read-playback-state',
      'user-modify-playback-state',
      'streaming'
    ]
  },

  whatsapp: {
    // TODO: paste WhatsApp Business number — international format, no + or spaces (e.g. 526643640788)
    number: '',
  },

  features: {
    transcription:  true,
    moodDetection:  true,
    spotifyMusic:   true,
    // future flags — flip to true when the phase is ready:
    // multiTenant:    false,
    // billing:        false,
    // instructorAuth: false,
  }
};
