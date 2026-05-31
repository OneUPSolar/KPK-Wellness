/* ============================================================
   KPK WELLNESS — RECIPE GALLERY + PAYWALL CLIENT JS
   ============================================================ */

const RECIPE_API = 'https://kpk-recipe-api.hi-7e4.workers.dev';
const GITHUB_RAW = 'https://raw.githubusercontent.com/OneUPSolar/KPK-Wellness/main';
const STORAGE_KEY = 'kpk_recipe_access';

let recipes = [];
let recipeConfig = null;
let currentFilter = 'all';
let isUnlocked = false;

/* ── Init ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  checkUnlockStatus();
  await loadRecipes();
  renderRecipes();
  bindFilterEvents();
  bindModalEvents();
});

/* ── Unlock Status ────────────────────── */
function checkUnlockStatus() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const { token, exp } = JSON.parse(saved);
      if (token && (!exp || Date.now() < exp)) {
        isUnlocked = true;
        showUnlockedBanner();
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function showUnlockedBanner() {
  const banner = document.getElementById('unlockedBanner');
  if (banner) banner.classList.add('show');
}

/* ── Load Recipes from GitHub ─────────── */
async function loadRecipes() {
  showLoading(true);

  try {
    // Load recipe config
    const configRes = await fetch(`${GITHUB_RAW}/content/recipe-config.json?t=${Date.now()}`);
    if (configRes.ok) {
      recipeConfig = await configRes.json();
    } else {
      recipeConfig = { freeRecipes: [], categories: {} };
    }

    // Load all recipe markdown files by category
    const categories = ['desayunos', 'ensaladas', 'pastas', 'postres'];
    const allRecipes = [];

    for (const cat of categories) {
      try {
        // Use GitHub API to list files in each category
        const apiRes = await fetch(
          `https://api.github.com/repos/OneUPSolar/KPK-Wellness/contents/content/recetas/${cat}`
        );
        if (!apiRes.ok) continue;

        const files = await apiRes.json();
        const mdFiles = files.filter(f => f.name.endsWith('.md'));
        const imgFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name));
        const audioFiles = files.filter(f => /\.(mp3|wav|ogg)$/i.test(f.name));

        for (const file of mdFiles) {
          try {
            const mdRes = await fetch(file.download_url);
            if (!mdRes.ok) continue;
            const mdContent = await mdRes.text();
            const recipe = parseRecipeMarkdown(mdContent, cat, imgFiles, audioFiles);
            if (recipe) allRecipes.push(recipe);
          } catch (e) { /* skip individual recipe errors */ }
        }
      } catch (e) { /* skip category errors */ }
    }

    recipes = allRecipes;
    updateStats();
  } catch (e) {
    console.error('Failed to load recipes:', e);
    recipes = [];
  }

  showLoading(false);
}

/* ── Parse Recipe Markdown ────────────── */
function parseRecipeMarkdown(md, category, availableImages, availableAudios) {
  // Parse frontmatter
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const frontmatter = {};
  fmMatch[1].split('\n').forEach(line => {
    const [key, ...valParts] = line.split(':');
    if (key && valParts.length) {
      frontmatter[key.trim()] = valParts.join(':').trim();
    }
  });

  // Parse body
  const body = md.slice(fmMatch[0].length).trim();

  // Extract title
  const titleMatch = body.match(/^# (.+)/m);
  const name = titleMatch ? titleMatch[1].trim() : frontmatter.id || 'Sin nombre';

  // Extract sub-titles
  const serioMatch = body.match(/Serio:\s*(.+)/);
  const juguetonMatch = body.match(/Jugueton:\s*(.+)/);

  // Extract sections
  const utensilios = extractListSection(body, 'Utensilios');
  const ingredientes = extractListSection(body, 'Ingredientes');
  const pasos = extractOrderedSection(body, 'Preparacion');

  // Extract macros
  const macros = {
    calorias: extractMacroValue(body, 'Calorias'),
    proteina: extractMacroValue(body, 'Proteina'),
    grasas: extractMacroValue(body, 'Grasas'),
    carbohidratos: extractMacroValue(body, 'Carbohidratos')
  };

  // Extract costeo
  const costoTotalMatch = body.match(/Costo total.*?:\s*\$?([\d,.]+)/i);
  const costoPorcionMatch = body.match(/Costo por porci[oó]n:\s*(.+)/i);

  // Find matching image
  const id = frontmatter.id || '';
  let imageUrl = null;
  if (availableImages) {
    const matchingImg = availableImages.find(f => {
      const baseName = f.name.replace(/\.(png|jpg|jpeg|webp)$/i, '');
      return baseName.toLowerCase().includes(id.toLowerCase().split('-')[0]);
    });
    if (matchingImg) {
      imageUrl = matchingImg.download_url;
    }
  }

  // Find matching audio
  let audioUrl = null;
  if (availableAudios) {
    const matchingAudio = availableAudios.find(f => {
      const baseName = f.name.replace(/\.(mp3|wav|ogg)$/i, '');
      return baseName.toLowerCase().includes(id.toLowerCase().split('-')[0]);
    });
    if (matchingAudio) {
      audioUrl = matchingAudio.download_url;
    }
  }

  // Determine if free
  const isFree = recipeConfig?.freeRecipes?.includes(id) || false;

  return {
    id,
    name,
    category,
    subcategory: frontmatter.subcategoria || '',
    servings: frontmatter.porciones || '',
    time: frontmatter.tiempo || '',
    cost: frontmatter.costo || '',
    difficulty: frontmatter.dificultad || 'facil',
    titleSerio: serioMatch ? serioMatch[1].trim() : '',
    titleJugueton: juguetonMatch ? juguetonMatch[1].trim() : '',
    utensilios,
    ingredientes,
    pasos,
    macros,
    costoTotal: costoTotalMatch ? costoTotalMatch[1] : frontmatter.costo || '',
    costoPorcion: costoPorcionMatch ? costoPorcionMatch[1].trim() : '',
    imageUrl,
    audioUrl,
    isFree
  };
}

function extractListSection(md, sectionName) {
  const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = md.match(regex);
  if (!match) return [];
  return match[1].trim().split('\n')
    .filter(l => l.startsWith('- '))
    .map(l => l.replace(/^- /, '').trim());
}

function extractOrderedSection(md, sectionName) {
  const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = md.match(regex);
  if (!match) return [];
  return match[1].trim().split('\n')
    .filter(l => /^\d+\./.test(l))
    .map(l => l.replace(/^\d+\.\s*/, '').trim());
}

function extractMacroValue(md, macroName) {
  const regex = new RegExp(`${macroName}:\\s*([\\d,.]+)`, 'i');
  const match = md.match(regex);
  return match ? match[1] : '';
}

/* ── Update Stats ─────────────────────── */
function updateStats() {
  const totalEl = document.getElementById('statTotal');
  const catEl = document.getElementById('statCategories');
  const freeEl = document.getElementById('statFree');

  if (totalEl) totalEl.textContent = recipes.length + '+';
  if (catEl) catEl.textContent = '4';
  if (freeEl) freeEl.textContent = recipes.filter(r => r.isFree).length;
}

/* ── Render Recipes ───────────────────── */
function renderRecipes() {
  const grid = document.getElementById('recipeGrid');
  if (!grid) return;

  const filtered = currentFilter === 'all'
    ? recipes
    : recipes.filter(r => r.category === currentFilter);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="recipe-empty" style="grid-column: 1/-1;">
        <div class="recipe-empty-icon">🍽️</div>
        <h3 lang="en">No recipes found</h3>
        <h3 lang="es">No se encontraron recetas</h3>
        <p lang="en">Try selecting a different category.</p>
        <p lang="es">Intenta seleccionar otra categoría.</p>
      </div>
    `;
    return;
  }

  // Sort: free recipes first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    if (a.isFree && !b.isFree) return -1;
    if (!a.isFree && b.isFree) return 1;
    return a.name.localeCompare(b.name, 'es');
  });

  grid.innerHTML = sorted.map(recipe => buildRecipeCard(recipe)).join('');

  // Animate cards in
  requestAnimationFrame(() => {
    grid.querySelectorAll('.recipe-card').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, i * 80);
    });
  });
}

function buildRecipeCard(recipe) {
  const canView = recipe.isFree || isUnlocked;
  const lockedClass = canView ? '' : ' locked';
  const categoryLabels = {
    desayunos: { emoji: '🍳', en: 'Breakfast', es: 'Desayuno' },
    ensaladas: { emoji: '🥗', en: 'Salad', es: 'Ensalada' },
    pastas: { emoji: '🍝', en: 'Pasta', es: 'Pasta' },
    postres: { emoji: '🍰', en: 'Dessert', es: 'Postre' }
  };
  const cat = categoryLabels[recipe.category] || { emoji: '🍽️', en: recipe.category, es: recipe.category };

  const diffLabels = {
    facil: { en: 'Easy', es: 'Fácil' },
    medio: { en: 'Medium', es: 'Medio' },
    dificil: { en: 'Hard', es: 'Difícil' }
  };
  const diff = diffLabels[recipe.difficulty] || { en: recipe.difficulty, es: recipe.difficulty };

  // Fallback image based on category
  const fallbackImages = {
    desayunos: 'assets/exp-culinary.jpg',
    ensaladas: 'assets/exp-nutrition.jpg',
    pastas: 'assets/exp-retreat.jpg',
    postres: 'assets/philosophy-chef.png'
  };
  const imgSrc = recipe.imageUrl || fallbackImages[recipe.category] || 'assets/exp-culinary.jpg';

  return `
    <div class="recipe-card${lockedClass}" data-id="${recipe.id}" onclick="handleRecipeClick('${recipe.id}')">
      <div class="recipe-card-img">
        <img src="${imgSrc}" alt="${recipe.name}" loading="lazy" onerror="this.src='assets/exp-culinary.jpg'">
        <div class="recipe-card-badge">${cat.emoji} <span lang="en">${cat.en}</span><span lang="es">${cat.es}</span></div>
        ${recipe.isFree ? '<div class="recipe-card-free-badge" lang="en">FREE</div><div class="recipe-card-free-badge" lang="es">GRATIS</div>' : ''}
        ${!canView ? `
          <div class="lock-overlay">
            <div class="lock-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <span class="lock-text" lang="en">Unlock to View</span>
            <span class="lock-text" lang="es">Desbloquear</span>
            <span class="lock-text" style="font-size: 0.7rem; text-decoration: underline; margin-top: 4px; opacity: 0.8;" lang="en">Buy Access</span>
            <span class="lock-text" style="font-size: 0.7rem; text-decoration: underline; margin-top: 4px; opacity: 0.8;" lang="es">Comprar Acceso</span>
          </div>
        ` : ''}
      </div>
      <div class="recipe-card-body">
        <h3>${recipe.name}</h3>
        ${recipe.titleJugueton ? `<div class="recipe-card-subtitle">${recipe.titleJugueton}</div>` : ''}
        <div class="recipe-card-meta">
          <span class="recipe-meta-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${recipe.time || '—'}
          </span>
          <span class="recipe-meta-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            ${recipe.servings || '—'} <span lang="en">serv.</span><span lang="es">porc.</span>
          </span>
          <span class="recipe-meta-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            <span lang="en">${diff.en}</span><span lang="es">${diff.es}</span>
          </span>
        </div>
        <div class="recipe-macros">
          ${recipe.macros.calorias ? `<span class="macro-pill">${recipe.macros.calorias} <span>kcal</span></span>` : ''}
          ${recipe.macros.proteina ? `<span class="macro-pill">${recipe.macros.proteina}g <span>prot</span></span>` : ''}
          ${recipe.macros.grasas ? `<span class="macro-pill">${recipe.macros.grasas}g <span>fat</span></span>` : ''}
          ${recipe.macros.carbohidratos ? `<span class="macro-pill">${recipe.macros.carbohidratos}g <span>carb</span></span>` : ''}
        </div>
      </div>
    </div>
  `;
}

/* ── Handle Recipe Click ──────────────── */
function handleRecipeClick(recipeId) {
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  if (recipe.isFree || isUnlocked) {
    showRecipeDetail(recipe);
  } else {
    openPasswordModal(recipeId);
  }
}

/* ── Recipe Detail Modal ──────────────── */
function showRecipeDetail(recipe) {
  const overlay = document.getElementById('detailOverlay');
  if (!overlay) return;

  const fallbackImages = {
    desayunos: 'assets/exp-culinary.jpg',
    ensaladas: 'assets/exp-nutrition.jpg',
    pastas: 'assets/exp-retreat.jpg',
    postres: 'assets/philosophy-chef.png'
  };
  const imgSrc = recipe.imageUrl || fallbackImages[recipe.category] || 'assets/exp-culinary.jpg';

  const diffLabels = { facil: 'Fácil', medio: 'Medio', dificil: 'Difícil' };

  overlay.querySelector('.detail-card').innerHTML = `
    <div class="detail-hero">
      <img src="${imgSrc}" alt="${recipe.name}" onerror="this.src='assets/exp-culinary.jpg'">
      <div class="detail-hero-overlay">
        <h1>${recipe.name}</h1>
        ${recipe.titleSerio ? `<div class="detail-subtitle">${recipe.titleSerio}</div>` : ''}
      </div>
      <button class="detail-close" onclick="closeDetail()">×</button>
    </div>

    <div class="detail-meta-bar">
      <div class="detail-meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        ${recipe.time || '—'}
      </div>
      <div class="detail-meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
        ${recipe.servings || '—'} porciones
      </div>
      <div class="detail-meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        ${diffLabels[recipe.difficulty] || recipe.difficulty}
      </div>
      <div class="detail-meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
        $${recipe.costoTotal || '—'} MXN
      </div>
    </div>

    ${recipe.audioUrl ? `
      <div class="detail-audio" style="margin: 20px; text-align: center;">
        <h4 style="margin-bottom: 8px; font-size: 0.9rem; color: var(--navy); opacity: 0.8;" lang="en">Listen to the Recipe</h4>
        <h4 style="margin-bottom: 8px; font-size: 0.9rem; color: var(--navy); opacity: 0.8;" lang="es">Escucha la Receta</h4>
        <audio controls src="${recipe.audioUrl}" style="width: 100%; border-radius: 30px;"></audio>
      </div>
    ` : ''}

    <div class="detail-content">
      ${recipe.utensilios.length ? `
        <div class="detail-section">
          <h2>🔧 Utensilios</h2>
          <ul>${recipe.utensilios.map(u => `<li>${u}</li>`).join('')}</ul>
        </div>
      ` : ''}

      <div class="detail-section">
        <h2>🥑 Ingredientes</h2>
        <ul>${recipe.ingredientes.map(i => `<li>${i}</li>`).join('')}</ul>
      </div>

      <div class="detail-section">
        <h2>👩‍🍳 Preparación</h2>
        <ol>${recipe.pasos.map(p => `<li>${p}</li>`).join('')}</ol>
      </div>

      <div class="detail-section">
        <h2>📊 Macros por porción</h2>
        <div class="macros-grid">
          <div class="macro-card">
            <div class="macro-card-value">${recipe.macros.calorias || '—'}</div>
            <div class="macro-card-label">Calorías (kcal)</div>
          </div>
          <div class="macro-card">
            <div class="macro-card-value">${recipe.macros.proteina || '—'}</div>
            <div class="macro-card-label">Proteína (g)</div>
          </div>
          <div class="macro-card">
            <div class="macro-card-value">${recipe.macros.grasas || '—'}</div>
            <div class="macro-card-label">Grasas (g)</div>
          </div>
          <div class="macro-card">
            <div class="macro-card-value">${recipe.macros.carbohidratos || '—'}</div>
            <div class="macro-card-label">Carbohidratos (g)</div>
          </div>
        </div>
      </div>

      ${recipe.costoTotal ? `
        <div class="detail-section">
          <h2>💰 Costeo Aproximado</h2>
          <div class="costeo-row">
            <span class="costeo-label">Costo total de la receta</span>
            <span class="costeo-value">$${recipe.costoTotal} MXN</span>
          </div>
          ${recipe.costoPorcion ? `
            <div class="costeo-row">
              <span class="costeo-label">Costo por porción</span>
              <span class="costeo-value">${recipe.costoPorcion}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  const overlay = document.getElementById('detailOverlay');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}

/* ── Password Modal ───────────────────── */
function openPasswordModal(pendingRecipeId) {
  const modal = document.getElementById('passwordModal');
  if (!modal) return;
  modal.classList.add('active');
  modal.dataset.pendingRecipe = pendingRecipeId || '';
  document.body.style.overflow = 'hidden';

  const input = document.getElementById('accessCodeInput');
  if (input) {
    input.value = '';
    input.classList.remove('error');
    input.focus();
  }
  const errorEl = document.getElementById('modalError');
  if (errorEl) errorEl.classList.remove('show');
}

function closePasswordModal() {
  const modal = document.getElementById('passwordModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

async function verifyAccessCode() {
  const input = document.getElementById('accessCodeInput');
  const errorEl = document.getElementById('modalError');
  const submitBtn = document.getElementById('modalSubmitBtn');
  const code = input.value.trim();

  if (!code) {
    input.classList.add('error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verificando...';
  input.classList.remove('error');
  errorEl.classList.remove('show');

  try {
    const res = await fetch(`${RECIPE_API}/verify-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    const data = await res.json();

    if (res.ok && data.token) {
      // Success — store token and unlock
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        token: data.token,
        exp: Date.now() + (365 * 24 * 60 * 60 * 1000) // 1 year
      }));
      isUnlocked = true;
      closePasswordModal();
      showUnlockedBanner();
      renderRecipes();
      showToast(getLang() === 'es' ? '✅ ¡Recetas desbloqueadas!' : '✅ Recipes unlocked!', 'success');

      // Open pending recipe if any
      const pendingId = document.getElementById('passwordModal').dataset.pendingRecipe;
      if (pendingId) {
        const recipe = recipes.find(r => r.id === pendingId);
        if (recipe) setTimeout(() => showRecipeDetail(recipe), 500);
      }
    } else {
      input.classList.add('error');
      errorEl.textContent = getLang() === 'es'
        ? 'Código incorrecto. Intenta de nuevo.'
        : 'Incorrect code. Try again.';
      errorEl.classList.add('show');
    }
  } catch (e) {
    errorEl.textContent = getLang() === 'es'
      ? 'Error de conexión. Intenta de nuevo.'
      : 'Connection error. Try again.';
    errorEl.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = getLang() === 'es' ? 'Desbloquear Recetas' : 'Unlock Recipes';
  }
}

/* ── Filter Events ────────────────────── */
function bindFilterEvents() {
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.category;
      renderRecipes();
    });
  });
}

/* ── Modal Events ─────────────────────── */
function bindModalEvents() {
  // Password modal
  const passwordModal = document.getElementById('passwordModal');
  if (passwordModal) {
    passwordModal.addEventListener('click', (e) => {
      if (e.target === passwordModal) closePasswordModal();
    });
  }

  // Detail modal
  const detailOverlay = document.getElementById('detailOverlay');
  if (detailOverlay) {
    detailOverlay.addEventListener('click', (e) => {
      if (e.target === detailOverlay) closeDetail();
    });
  }

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePasswordModal();
      closeDetail();
    }
  });

  // Enter key in password input
  const codeInput = document.getElementById('accessCodeInput');
  if (codeInput) {
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyAccessCode();
    });
  }
}

/* ── Helpers ──────────────────────────── */
function showLoading(show) {
  const loader = document.getElementById('recipeLoading');
  const grid = document.getElementById('recipeGrid');
  if (loader) loader.style.display = show ? 'block' : 'none';
  if (grid) grid.style.display = show ? 'none' : 'grid';
}

function getLang() {
  return document.body.classList.contains('lang-es') ? 'es' : 'en';
}

function showToast(msg, type) {
  const toast = document.getElementById('recipeToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'recipe-toast show ' + (type || '');
  setTimeout(() => toast.className = 'recipe-toast', 3500);
}

/* ── Make functions globally accessible ── */
window.handleRecipeClick = handleRecipeClick;
window.closeDetail = closeDetail;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.verifyAccessCode = verifyAccessCode;
