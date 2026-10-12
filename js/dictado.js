/**
 * Dictado: un botón de micrófono que escribe en un campo de texto.
 *
 *   Dictado.boton(textarea, { idioma: 'es-MX', clase: '...' }) → <button>
 *
 * Usa el reconocimiento de voz del navegador (Chrome, Safari). Donde no
 * existe (algunas apps instaladas en iPhone), el botón enfoca el campo y
 * recuerda usar el micrófono del teclado, que siempre funciona.
 */
(function () {
  'use strict';
  var Reconocer = window.SpeechRecognition || window.webkitSpeechRecognition;
  var MIC = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

  function boton(campo, opciones) {
    var o = opciones || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.className = o.clase || 'dictado';
    b.innerHTML = MIC;
    b.setAttribute('aria-label', 'Dictar por voz');
    b.title = 'Dictar por voz';
    b.setAttribute('aria-pressed', 'false');

    if (!Reconocer) {
      b.addEventListener('click', function () {
        campo.focus();
        if (o.aviso) o.aviso('Toca el micrófono de tu teclado para dictar.');
      });
      return b;
    }

    var rec = null, base = '';
    function parar() { if (rec) { try { rec.stop(); } catch (e) {} } }
    b.addEventListener('click', function () {
      if (rec) { parar(); return; }
      rec = new Reconocer();
      rec.lang = o.idioma || 'es-MX';
      rec.interimResults = true;
      rec.continuous = true;
      base = campo.value ? campo.value.replace(/\s*$/, ' ') : '';
      rec.onresult = function (ev) {
        var final = '', parcial = '';
        for (var i = 0; i < ev.results.length; i++) {
          var t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) final += t; else parcial += t;
        }
        campo.value = base + final + parcial;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
      };
      rec.onerror = function (ev) {
        if (o.aviso && ev.error !== 'no-speech' && ev.error !== 'aborted') {
          o.aviso(ev.error === 'not-allowed' ? 'Permite el micrófono para dictar.' : 'No se pudo dictar. Usa el micrófono del teclado.');
        }
      };
      rec.onend = function () { rec = null; b.classList.remove('escuchando'); b.setAttribute('aria-pressed', 'false'); };
      try {
        rec.start();
        b.classList.add('escuchando');
        b.setAttribute('aria-pressed', 'true');
      } catch (e) { rec = null; }
    });
    return b;
  }

  window.Dictado = { boton: boton, disponible: Boolean(Reconocer) };
}());
