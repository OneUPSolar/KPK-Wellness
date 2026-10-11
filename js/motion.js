/*
 * Motion kit (Designs Mamalonskis): GSAP + ScrollTrigger + SplitText + Lenis.
 *
 * Carga antes de este archivo: gsap, ScrollTrigger, SplitText, lenis.
 * Marca el HTML y llama a Motion.init(raiz) cuando el contenido ya está en
 * pantalla; en páginas que se pintan por JS, vuelve a llamarlo tras cada
 * pintado: limpia lo anterior y arma lo nuevo.
 *
 *   data-split             el titular entra línea por línea
 *   data-reveal            aparece y sube al entrar a la vista
 *   data-reveal="stagger"  igual, hijo por hijo
 *   data-parallax="0.2"    se mueve más lento que la página
 *   data-count="1250"      cuenta desde 0 (formato: data-format="moneda:MXN" u omitido)
 *   data-lenis-prevent     en un contenedor con scroll propio (p. ej. un carrusel)
 *
 * Con "reducir movimiento" todo queda en su estado final, sin animar.
 */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var listo = typeof gsap !== "undefined";
  if (listo) gsap.registerPlugin(ScrollTrigger, SplitText);

  // Scroll suave solo con mouse/trackpad; en el teléfono el nativo se siente mejor.
  if (listo && !reduce && window.matchMedia("(pointer: fine)").matches && window.Lenis && !window.lenis) {
    var lenis = new Lenis({ autoRaf: false });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
    window.lenis = lenis;
  }

  var splits = [];
  function limpiar() {
    if (!listo) return;
    ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
    splits.forEach(function (s) { try { s.revert(); } catch (e) { /* ya revertido */ } });
    splits = [];
  }

  function formato(el, v) {
    var f = el.getAttribute("data-format") || "";
    if (f.indexOf("moneda:") === 0 && window.Motion.dinero) return window.Motion.dinero(v, f.slice(7));
    return Math.round(v).toLocaleString();
  }

  function init(raiz) {
    raiz = raiz || document;
    limpiar();
    var $$ = function (sel) { return Array.prototype.slice.call(raiz.querySelectorAll(sel)); };

    if (reduce || !listo) {
      $$("[data-count]").forEach(function (el) { el.textContent = formato(el, Number(el.getAttribute("data-count"))); });
      return;
    }
    var alVer = function (el) { return { trigger: el, start: "top 85%", once: true }; };

    $$("[data-reveal]").forEach(function (el) {
      var objetivos = el.getAttribute("data-reveal") === "stagger" ? el.children : el;
      gsap.from(objetivos, { y: 32, autoAlpha: 0, duration: 0.9, ease: "power3.out", stagger: 0.08, scrollTrigger: alVer(el) });
    });

    // Si una fuente se queda colgada, no se queda colgado el título: tope de 1.5 s.
    Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
      $$("[data-split]").forEach(function (el) {
        var s = SplitText.create(el, {
          type: "lines", mask: "lines", autoSplit: true,
          onSplit: function (self) {
            return gsap.from(self.lines, { yPercent: 110, duration: 1, ease: "expo.out", stagger: 0.09, delay: 0.1 });
          }
        });
        splits.push(s);
      });
    });

    $$("[data-parallax]").forEach(function (el) {
      var v = parseFloat(el.getAttribute("data-parallax")) || 0.2;
      gsap.to(el, { yPercent: -100 * v, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
    });

    $$("[data-count]").forEach(function (el) {
      var fin = Number(el.getAttribute("data-count")), n = { v: 0 };
      gsap.to(n, { v: fin, duration: 1.4, ease: "power2.out", scrollTrigger: alVer(el),
        onUpdate: function () { el.textContent = formato(el, n.v); } });
    });
  }

  window.Motion = { init: init, limpiar: limpiar, reduce: reduce, dinero: null };
})();
