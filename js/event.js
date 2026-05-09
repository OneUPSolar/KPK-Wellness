/* KPK Wellness — Event Page JS */
const WA_NUMBER = '526643640788';
const WA_MSG = encodeURIComponent('Hola, quiero información para reservar mi lugar en el taller de cocina saludable y nutrición del 16 de mayo en Playas de Tijuana.');
const API_URL = 'https://kpk-recipe-api.hi-7e4.workers.dev';

/* ── Navbar scroll ─────────────────── */
window.addEventListener('scroll', () => {
  document.querySelector('.ev-nav')?.classList.toggle('scrolled', window.scrollY > 40);
});

/* ── Smooth scroll ─────────────────── */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  const el = document.querySelector(a.getAttribute('href'));
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ── WhatsApp links ────────────────── */
function openWhatsApp() {
  window.open(`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`, '_blank');
}

/* ── Form Submission ───────────────── */
async function handleEventForm(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('.form-submit');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const data = {
    nombre: form.nombre.value,
    telefono: form.telefono.value,
    email: form.email.value,
    lugares: form.lugares.value,
    restricciones: form.restricciones.value,
    mensaje: form.mensaje.value,
    evento: 'Cocina Saludable + Nutrición — 16 de Mayo',
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      form.style.display = 'none';
      document.getElementById('formSuccess').style.display = 'block';
      showToast('✅ ¡Registro enviado exitosamente!');
    } else {
      throw new Error('Server error');
    }
  } catch (err) {
    showToast('Error al enviar. Intenta por WhatsApp.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Quiero reservar';
  }
}

/* ── Reveal on Scroll ──────────────── */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});

/* ── Toast ─────────────────────────── */
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast', 4000);
}
