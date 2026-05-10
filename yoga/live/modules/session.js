/**
 * modules/session.js — Session state machine.
 *
 * States: idle → active → idle
 * (Future phases may add: paused, error, auth-required)
 *
 * The state machine owns start/stop transitions and delegates
 * to the injected subsystem objects (transcription, viz, ui).
 * It does not touch the DOM or the music provider directly.
 */

export const SessionState = {
  IDLE:   'idle',
  ACTIVE: 'active'
};

/**
 * Create a session controller.
 *
 * @param {{ transcription, viz, ui, i18n, getLang }} deps
 * @returns {{ start, stop, getState, toggle }}
 */
export function createSession({ transcription, viz, ui, i18n, getLang }) {
  let state = SessionState.IDLE;

  function getLabel(key) {
    return i18n[key]?.[getLang()] ?? key;
  }

  return {
    getState: () => state,

    async start() {
      if (state === SessionState.ACTIVE) return;
      state = SessionState.ACTIVE;

      ui.setSessionActive(getLabel('btnStopSession'));
      await viz.start();
      transcription.start();
    },

    stop() {
      if (state === SessionState.IDLE) return;
      state = SessionState.IDLE;

      ui.setSessionIdle(getLabel('btnStartSession'));
      viz.stop();
      transcription.stop();
      ui.hideMood();
    },

    toggle() {
      if (state === SessionState.IDLE) {
        this.start();
      } else {
        this.stop();
      }
    }
  };
}
