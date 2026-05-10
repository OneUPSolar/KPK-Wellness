/**
 * modules/moodDetector.js — Keyword-to-mood matching engine.
 *
 * Owns the bilingual yogaMoodMap.
 * Scans transcript text for known keywords in the active language
 * and returns the matched mood + HTML-annotated text for the transcript panel.
 */

// The complete yoga mood → keyword dictionary.
// Extend this map to add new moods or vocabulary without touching any other file.
export const yogaMoodMap = {
  grounding: {
    en: ['downward dog', 'mountain', 'root', 'ground', 'earth', 'foundation'],
    es: ['perro boca abajo', 'montaña', 'raíz', 'tierra', 'fundación', 'arraigar']
  },
  strength: {
    en: ['warrior', 'plank', 'core', 'power', 'strong', 'hold'],
    es: ['guerrero', 'plancha', 'centro', 'fuerza', 'fuerte', 'mantener']
  },
  calm: {
    en: ["child's pose", 'rest', 'soften', 'release', 'gentle'],
    es: ['postura del niño', 'descanso', 'suaviza', 'libera', 'gentil']
  },
  rest: {
    en: ['savasana', 'corpse', 'final rest', 'lying down'],
    es: ['savasana', 'cadáver', 'descanso final', 'recostado']
  },
  dynamic: {
    en: ['flow', 'vinyasa', 'transition', 'move', 'sun salutation'],
    es: ['flujo', 'vinyasa', 'transición', 'movimiento', 'saludo al sol']
  },
  meditative: {
    en: ['breathe', 'inhale', 'exhale', 'pranayama', 'meditation'],
    es: ['respira', 'inhala', 'exhala', 'pranayama', 'meditación']
  },
  focus: {
    en: ['balance', 'tree pose', 'eagle', 'gaze', 'drishti'],
    es: ['equilibrio', 'postura del árbol', 'águila', 'mirada', 'drishti']
  }
};

/**
 * Scan a transcript string for mood keywords in the active language.
 *
 * @param {string} text    Raw transcript text from the Speech API.
 * @param {string} lang    'en' | 'es'
 * @returns {{ mood: string|null, highlightedHtml: string }}
 *    mood            - the first matched mood key, or null if none
 *    highlightedHtml - the text with matched keywords wrapped in <span class="keyword-highlight">
 */
export function detectMood(text, lang) {
  let html     = text;
  let mood     = null;

  for (const [moodKey, langs] of Object.entries(yogaMoodMap)) {
    const keywords = langs[lang] ?? [];
    for (const kw of keywords) {
      // Escape regex special chars in the keyword
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex   = new RegExp(`(${escaped})`, 'gi');
      if (regex.test(html)) {
        html = html.replace(regex, '<span class="keyword-highlight">$1</span>');
        if (!mood) mood = moodKey; // first match wins
      }
    }
  }

  return { mood, highlightedHtml: html };
}
