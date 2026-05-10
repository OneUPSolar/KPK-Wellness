// nav.js - Navigation, Header Injection, and Language Toggle

// TODO: replace with Karina's WhatsApp Business number (international format, no + or spaces)
const WHATSAPP_NUMBER = '526643640788'; // Using the one from index.html for now

const navTemplate = `
<header class="yoga-nav" id="yogaNav">
  <a href="/yoga/" class="nav-brand" data-i18n="navBrand">School of Open Yoga</a>
  <div class="nav-actions">
    <a href="/yoga/live/" class="nav-link" data-i18n="navLive">Live</a>
    <a href="/yoga/recorded/" class="nav-link" data-i18n="navRecorded">Library</a>
    <a href="/yoga/about/" class="nav-link" data-i18n="navAbout">About</a>
    <button id="langToggle" class="lang-toggle">
      <span id="lang-en" class="active">EN</span> | <span id="lang-es">ES</span>
    </button>
  </div>
</header>
`;

document.addEventListener('DOMContentLoaded', () => {
  // Inject Navigation
  document.body.insertAdjacentHTML('afterbegin', navTemplate);

  const langToggleBtn = document.getElementById('langToggle');
  const langEnSpan = document.getElementById('lang-en');
  const langEsSpan = document.getElementById('lang-es');

  // Initialization: detect saved language or browser default
  let currentLang = localStorage.getItem('yoga_lang');
  if (!currentLang) {
    currentLang = navigator.language.startsWith('es') ? 'es' : 'en';
  }

  // Set initial language
  setLanguage(currentLang);

  // Toggle Listener
  langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'en' ? 'es' : 'en';
    setLanguage(currentLang);
  });

  function setLanguage(lang) {
    // 1. Update localStorage
    localStorage.setItem('yoga_lang', lang);

    // 2. Update body class (handles CSS display logic)
    document.body.className = document.body.className.replace(/lang-(en|es)/, '').trim();
    document.body.classList.add(`lang-${lang}`);

    // 3. Update Toggle UI
    if (lang === 'en') {
      langEnSpan.classList.add('active');
      langEsSpan.classList.remove('active');
    } else {
      langEsSpan.classList.add('active');
      langEnSpan.classList.remove('active');
    }

    // 4. Update dynamic i18n text via dataset
    if (window.i18n) {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (window.i18n[key] && window.i18n[key][lang]) {
          // If the element has children (like spans we want to preserve), handle carefully
          // For now, standard textContent replacement
          el.textContent = window.i18n[key][lang];
        }
      });
    }
    
    // Dispatch event so other scripts (like the Web Speech API) know language changed
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  }

  // Scroll effect for nav
  const nav = document.getElementById('yogaNav');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  });
});
