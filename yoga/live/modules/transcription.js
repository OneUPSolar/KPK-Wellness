/**
 * modules/transcription.js — Web Speech API wrapper.
 *
 * Responsible for:
 * - Setting up SpeechRecognition with continuous + interimResults
 * - Respecting the active language toggle (en-US / es-MX)
 * - Calling onFinalResult(text) for each committed utterance
 * - Calling onError(err) on recognition failures
 * - Auto-restarting if it drops while a session is active
 */

export function createTranscription({ onFinalResult, onError }) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return {
      isSupported: false,
      start: () => {},
      stop:  () => {},
      setLang: () => {}
    };
  }

  const recognition = new SpeechRecognition();
  recognition.continuous     = true;
  recognition.interimResults = true;

  let active = false;

  // Set recognition language from the stored preference
  function setLang() {
    const lang = localStorage.getItem('yoga_lang') || 'en';
    recognition.lang = lang === 'en' ? 'en-US' : 'es-MX';
  }

  // React to language toggle events fired by nav.js
  window.addEventListener('languageChanged', setLang);
  setLang();

  recognition.onresult = (event) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
      // Interim results are intentionally not rendered (cleaner studio aesthetic)
    }
    if (finalTranscript && onFinalResult) {
      onFinalResult(finalTranscript.trim());
    }
  };

  recognition.onerror = (event) => {
    console.error('[Transcription] error:', event.error);
    if (event.error === 'not-allowed') {
      active = false;
    }
    if (onError) onError(event.error);
  };

  // Auto-restart on unexpected end while session is supposed to be running
  recognition.onend = () => {
    if (active) {
      try { recognition.start(); } catch (e) { /* already running */ }
    }
  };

  return {
    isSupported: true,

    start() {
      active = true;
      recognition.start();
    },

    stop() {
      active = false;
      recognition.stop();
    },

    /** Called externally when the language toggle changes. */
    setLang
  };
}
