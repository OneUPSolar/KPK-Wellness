/**
 * Bug-off: reportar una falla o pedir una mejora desde cualquier pantalla,
 * con captura de pantalla. Solo aparece con sesión de administrador.
 *
 *   <script src="/js/dictado.js" defer></script>
 *   <script src="/js/bugoff.js" defer></script>
 *
 * Pone un botón "Reportar" abajo a la izquierda. El ticket va a /api/tickets:
 * se vuelve un issue `bug-off` en GitHub y avisa por correo y Telegram con la
 * captura adjunta (la captura no se publica en GitHub: el repo es público).
 * BugOff.abrir() lo abre desde otro botón; data-bugoff="sin-boton" en <body>
 * oculta el botón flotante.
 */
(function () {
  'use strict';
  function sesion() {
    try { var s = JSON.parse(localStorage.getItem('kpk_auth') || 'null'); return s && s.token ? s : null; } catch (e) { return null; }
  }

  var CSS = [
    '.bo-boton{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:35;display:inline-flex;align-items:center;gap:7px;',
    'font:600 .82rem/1 Inter,system-ui,sans-serif;color:#F7F5F1;background:#1F2024;border:1px solid #3A3B3F;border-radius:999px;padding:10px 14px;cursor:pointer;box-shadow:0 8px 22px rgba(31,32,36,.25)}',
    '.bo-boton:hover{border-color:#7A9E8E}.bo-boton svg{width:16px;height:16px}',
    'body.vista-cliente .bo-boton{display:none}',
    '.bo-fondo{position:fixed;inset:0;z-index:60;background:rgba(31,32,36,.55);display:grid;align-items:end;justify-items:center}',
    '@media(min-width:640px){.bo-fondo{align-items:center}}',
    '.bo-caja{width:min(520px,100%);max-height:calc(100dvh - env(safe-area-inset-top,0px));overflow-y:auto;background:#F7F5F1;color:#1F2024;',
    'border-radius:20px 20px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));display:grid;gap:12px;font:400 .95rem/1.45 Inter,system-ui,sans-serif}',
    '@media(min-width:640px){.bo-caja{border-radius:20px}}',
    '.bo-cab{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.bo-cab b{font:600 1.45rem/1.1 "Cormorant Garamond",Georgia,serif}',
    '.bo-x{width:38px;height:38px;border-radius:50%;border:1px solid #DCD6CC;background:none;font-size:1.3rem;cursor:pointer;color:#55565B}',
    '.bo-tipos{display:flex;gap:6px}.bo-tipos button{font:600 .82rem Inter,sans-serif;border:1px solid #DCD6CC;background:none;border-radius:999px;padding:7px 14px;cursor:pointer;color:#55565B}',
    '.bo-tipos button[aria-pressed=true]{background:#1F2024;color:#fff;border-color:#1F2024}',
    '.bo-caja input[type=text],.bo-caja textarea{width:100%;box-sizing:border-box;font:400 16px/1.4 Inter,sans-serif;border:1px solid #DCD6CC;border-radius:12px;padding:11px 13px;background:#fff;color:#1F2024}',
    '.bo-caja textarea{min-height:96px;resize:vertical}',
    '.bo-fila{display:flex;gap:8px;align-items:flex-start}.bo-fila textarea{flex:1}',
    '.bo-caja .dictado{width:44px;height:44px;flex:none;border-radius:50%;border:1px solid #7A9E8E;background:#fff;color:#4F7466;display:grid;place-items:center;cursor:pointer}',
    '.bo-caja .dictado.escuchando{background:#7A9E8E;color:#fff}',
    '.bo-captura{display:grid;gap:8px}.bo-captura label{display:flex;align-items:center;justify-content:center;gap:8px;border:1px dashed #B9B2A6;border-radius:12px;padding:12px;cursor:pointer;color:#55565B;font-weight:500}',
    '.bo-captura img{max-height:180px;max-width:100%;border-radius:10px;justify-self:start;border:1px solid #DCD6CC}',
    '.bo-acciones{display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:#F7F5F1;padding-top:6px}',
    '.bo-acciones button{font:600 .9rem Inter,sans-serif;border-radius:999px;padding:11px 18px;cursor:pointer;border:1px solid #1F2024}',
    '.bo-enviar{background:#4F7466;border-color:#4F7466!important;color:#fff}.bo-enviar:disabled{opacity:.55}',
    '.bo-volver{background:none;color:#1F2024}',
    '.bo-aviso{font-size:.88rem;margin:0}.bo-aviso.ok{color:#4F7466}.bo-aviso.error{color:#A2453D}',
    '.bo-caja :focus-visible{outline:2px solid #7A9E8E;outline-offset:2px}'
  ].join('');

  var BICHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7V4M9 4l1.5 2M15 4l-1.5 2M7 12H3M21 12h-4M7 16l-3 2M17 16l3 2M7 9 4 7M17 9l3-2"/></svg>';

  /** Reduce la captura a 1600 px y JPEG: llega rápido y cabe en el correo. */
  function reducir(archivo) {
    return new Promise(function (ok, mal) {
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        ok(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { mal(new Error('No se pudo leer la imagen.')); };
      img.src = URL.createObjectURL(archivo);
    });
  }

  function abrir() {
    var s = sesion();
    if (!s) { location.href = '/app/'; return; }
    if (document.querySelector('.bo-fondo')) return;
    var tipo = 'falla', captura = '';
    var fondo = document.createElement('div');
    fondo.className = 'bo-fondo';
    fondo.innerHTML =
      '<div class="bo-caja" role="dialog" aria-modal="true" aria-label="Reportar a Bug-off">' +
        '<div class="bo-cab"><b>Reportar</b><button type="button" class="bo-x" aria-label="Cerrar">×</button></div>' +
        '<div class="bo-tipos"><button type="button" data-t="falla" aria-pressed="true">Falla</button><button type="button" data-t="mejora" aria-pressed="false">Mejora</button></div>' +
        '<input type="text" class="bo-titulo" maxlength="120" placeholder="En una línea: ¿qué pasa?" aria-label="Título">' +
        '<div class="bo-fila"><textarea class="bo-detalle" placeholder="Cuenta más: qué hacías, qué esperabas, qué pasó…" aria-label="Detalle"></textarea></div>' +
        '<div class="bo-captura"><label>' + BICHO.replace('<svg', '<svg width="18" height="18"') +
          '<span class="bo-cap-txt">Adjuntar captura de pantalla</span><input type="file" accept="image/*" hidden></label></div>' +
        '<p class="bo-aviso" hidden></p>' +
        '<div class="bo-acciones"><button type="button" class="bo-volver">← Volver</button><button type="button" class="bo-enviar">Enviar ticket</button></div>' +
      '</div>';
    document.body.appendChild(fondo);
    var caja = fondo.querySelector('.bo-caja');
    var $ = function (sel) { return caja.querySelector(sel); };
    var aviso = function (clase, t) { var p = $('.bo-aviso'); p.className = 'bo-aviso ' + clase; p.textContent = t; p.hidden = !t; };
    if (window.Dictado) $('.bo-fila').appendChild(window.Dictado.boton($('.bo-detalle'), { aviso: function (t) { aviso('', t); } }));

    function cerrar() { fondo.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', esc);
    $('.bo-x').addEventListener('click', cerrar);
    $('.bo-volver').addEventListener('click', cerrar);
    fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrar(); });
    Array.prototype.forEach.call(caja.querySelectorAll('.bo-tipos button'), function (b) {
      b.addEventListener('click', function () {
        tipo = b.getAttribute('data-t');
        Array.prototype.forEach.call(caja.querySelectorAll('.bo-tipos button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    $('input[type=file]').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      reducir(f).then(function (url) {
        captura = url;
        var vieja = $('.bo-captura img'); if (vieja) vieja.remove();
        var img = document.createElement('img'); img.src = url; img.alt = 'Captura adjunta';
        $('.bo-captura').appendChild(img);
        $('.bo-cap-txt').textContent = 'Cambiar captura';
      }).catch(function (err) { aviso('error', err.message); });
    });
    $('.bo-enviar').addEventListener('click', function () {
      var b = $('.bo-enviar');
      var titulo = $('.bo-titulo').value.trim();
      if (titulo.length < 4) { aviso('error', 'Cuenta en una línea qué pasa.'); $('.bo-titulo').focus(); return; }
      b.disabled = true; b.textContent = 'Enviando…'; aviso('', '');
      fetch('/api/tickets', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + s.token, 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: tipo, titulo: titulo, detalle: $('.bo-detalle').value, captura: captura,
          pagina: location.href, dispositivo: navigator.userAgent })
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'No se pudo enviar.'); return j; }); })
        .then(function (j) {
          aviso(j.advertencia ? 'error' : 'ok', 'Ticket #' + j.ticket.numero + ' enviado. Bug-off ya lo tiene.' + (j.advertencia ? ' ' + j.advertencia : ''));
          b.textContent = 'Enviado';
          if (!j.advertencia) setTimeout(cerrar, 2200);
        })
        .catch(function (err) { aviso('error', err.message); b.disabled = false; b.textContent = 'Enviar ticket'; });
    });
    $('.bo-titulo').focus();
  }

  function montar() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    if (!sesion() || document.body.getAttribute('data-bugoff') === 'sin-boton') return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'bo-boton'; b.innerHTML = BICHO + 'Reportar';
    b.setAttribute('aria-label', 'Reportar una falla o mejora');
    b.addEventListener('click', abrir);
    document.body.appendChild(b);
  }

  window.BugOff = { abrir: abrir, reducir: reducir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
}());
