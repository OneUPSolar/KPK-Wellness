document.addEventListener('DOMContentLoaded', () => {
  // --- LANGUAGE TOGGLE ---
  const langBtn = document.getElementById('langToggle');
  const lblEn = document.getElementById('lbl-en');
  const lblEs = document.getElementById('lbl-es');
  let lang = localStorage.getItem('kpk_lang') || 'en';
  const setLang = (l) => {
    lang = l;
    document.body.className = 'lang-' + l;
    localStorage.setItem('kpk_lang', l);
    lblEn.classList.toggle('active', l === 'en');
    lblEs.classList.toggle('active', l === 'es');
  };
  setLang(lang);
  langBtn.addEventListener('click', () => setLang(lang === 'en' ? 'es' : 'en'));

  // --- NAVBAR SCROLL ---
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });

  // --- PARALLAX HERO ---
  const heroImg = document.querySelector('.parallax-img');
  if (heroImg) {
    window.addEventListener('scroll', () => {
      if (window.scrollY < window.innerHeight) {
        heroImg.style.transform = `scale(1.05) translateY(${window.scrollY * 0.25}px)`;
      }
    });
  }

  // --- SCROLL REVEAL ---
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  reveals.forEach(el => observer.observe(el));

  // --- OFFERINGS TABS ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll(`[data-tab="${tab}"]`).forEach(b => b.classList.add('active'));
      const panel = document.getElementById('tab-' + tab);
      if (panel) panel.classList.add('active');
    });
  });

  // --- FORM ---
  window.handleForm = (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = lang === 'es' ? '¡Listo! Te contactaremos pronto.' : 'Done! We\'ll be in touch soon.';
    btn.style.background = 'var(--sage)';
    btn.style.color = '#fff';
    e.target.reset();
  };

  // --- SMOOTH SCROLL for nav links ---
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
});
