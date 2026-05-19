/* KPK Wellness — Recipe Admin JS */
const API_URL = 'https://kpk-recipe-api.hi-7e4.workers.dev';
let AUTH_TOKEN = '';
let imageData = null;
let imageName = '';

/* ── Auth ─────────────────────────────── */
async function authenticate() {
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  if (!email || !password) return;

  document.getElementById('authError').style.display = 'none';
  const loginBtn = document.querySelector('.auth-card button');
  loginBtn.textContent = 'Entrando...';
  loginBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      document.getElementById('authError').textContent = data.error || 'Error de autenticación';
      document.getElementById('authError').style.display = 'block';
      return;
    }

    AUTH_TOKEN = data.token;
    localStorage.setItem('kpk_auth', JSON.stringify({ token: data.token, email: data.email }));
    showApp(data.email);
  } catch (e) {
    document.getElementById('authError').textContent = 'No se pudo conectar al servidor';
    document.getElementById('authError').style.display = 'block';
  } finally {
    loginBtn.textContent = 'Entrar';
    loginBtn.disabled = false;
  }
}

function logout() {
  localStorage.removeItem('kpk_auth');
  AUTH_TOKEN = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('emailInput').value = '';
  document.getElementById('passwordInput').value = '';
}

function showApp(email) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('userEmail').textContent = email || '';
}

/* Auto-login */
(function() {
  const saved = localStorage.getItem('kpk_auth');
  if (saved) {
    try {
      const { token, email } = JSON.parse(saved);
      AUTH_TOKEN = token;
      showApp(email);
    } catch(e) { localStorage.removeItem('kpk_auth'); }
  }
})();

/* ── Dynamic Lists ────────────────────── */
function addItem(listId, placeholder) {
  const list = document.getElementById(listId);
  const div = document.createElement('div');
  div.className = 'list-item';
  div.innerHTML = `<input type="text" placeholder="${placeholder}" oninput="updatePreview()"><button onclick="removeItem(this)">×</button>`;
  list.appendChild(div);
  div.querySelector('input').focus();
}

function removeItem(btn) {
  const list = btn.parentElement.parentElement;
  if (list.children.length > 1) {
    btn.parentElement.remove();
    updatePreview();
  }
}

/* ── Image Handling ───────────────────── */
function handleImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  processImage(file);
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) processImage(file);
}

function processImage(file) {
  imageName = file.name;
  const reader = new FileReader();
  reader.onload = function(ev) {
    imageData = ev.target.result.split(',')[1];
    const preview = document.getElementById('imagePreview');
    preview.src = ev.target.result;
    preview.style.display = 'block';
    document.querySelector('#uploadZone p').textContent = `✅ ${file.name}`;
  };
  reader.readAsDataURL(file);
}

/* ── Slug Generator ───────────────────── */
function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/* ── Collect List Values ──────────────── */
function getListValues(listId) {
  return Array.from(document.querySelectorAll(`#${listId} input`))
    .map(i => i.value.trim())
    .filter(v => v);
}

/* ── Build Markdown ───────────────────── */
function buildMarkdown() {
  const nombre = document.getElementById('fNombre').value.trim();
  const id = slugify(nombre || 'nueva-receta');
  const cat = document.getElementById('fCategoria').value;
  const sub = document.getElementById('fSubcategoria').value.trim();
  const porc = document.getElementById('fPorciones').value;
  const tiempo = document.getElementById('fTiempo').value.trim();
  const costoTotal = document.getElementById('fCostoTotal').value;
  const dif = document.getElementById('fDificultad').value;
  const serio = document.getElementById('fTituloSerio').value.trim();
  const jugue = document.getElementById('fTituloJugueton').value.trim();

  const utensilios = getListValues('utensiliosList');
  const ingredientes = getListValues('ingredientesList');
  const pasos = getListValues('pasosList');

  const cal = document.getElementById('fCalorias').value;
  const pro = document.getElementById('fProteina').value;
  const gra = document.getElementById('fGrasas').value;
  const carb = document.getElementById('fCarbos').value;
  const costoPorcion = document.getElementById('fCostoPorcion').value.trim();

  let md = `---
id: ${id}
categoria: ${cat}
subcategoria: ${sub}
porciones: ${porc}
tiempo: ${tiempo}
costo: ${costoTotal}
dificultad: ${dif}
---

# ${nombre}

## Titulo
Serio: ${serio}  
Jugueton: ${jugue}  

## Utensilios
${utensilios.map(u => `- ${u}`).join('\n')}

## Ingredientes
${ingredientes.map(i => `- ${i}`).join('\n')}

## Preparacion
${pasos.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Macros
- Calorias: ${cal} kcal
- Proteina: ${pro} g
- Grasas: ${gra} g
- Carbohidratos: ${carb} g

## Costeo aproximado
Costo total de la receta: $${costoTotal} MXN  
Costo por porción: ${costoPorcion}  
`;
  return { md, id, cat };
}

/* ── Live Preview ─────────────────────── */
function updatePreview() {
  const { md } = buildMarkdown();
  document.getElementById('markdownPreview').textContent = md;
}

/* ── Worker Commit ────────────────────── */
async function commitFile(path, content, message, isBase64) {
  const res = await fetch(`${API_URL}/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({ path, content, message, isBase64 })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Commit failed');
  }
  return res.json();
}

/* ── Submit Recipe ────────────────────── */
async function submitRecipe() {
  const nombre = document.getElementById('fNombre').value.trim();
  if (!nombre) { showToast('Falta el nombre de la receta', true); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Publicando...';

  try {
    const { md, id, cat } = buildMarkdown();
    const mdPath = `content/recetas/${cat}/${id}.md`;
    await commitFile(mdPath, md, `receta: ${nombre}`, false);

    if (imageData && imageName) {
      const ext = imageName.split('.').pop();
      const imgPath = `content/recetas/${cat}/${id}.${ext}`;
      await commitFile(imgPath, imageData, `imagen: ${nombre}`, true);
    }

    showToast(`✅ Receta "${nombre}" publicada exitosamente`);
    resetForm();
  } catch(e) {
    if (e.message.includes('No autorizada')) {
      showToast('Sesión expirada — inicia sesión de nuevo', true);
      logout();
    } else {
      showToast(`Error: ${e.message}`, true);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publicar Receta 🚀';
  }
}

/* ── Reset Form ───────────────────────── */
function resetForm() {
  document.querySelectorAll('.form-panel input[type="text"], .form-panel input[type="number"], .form-panel textarea').forEach(i => i.value = '');
  document.getElementById('fCategoria').selectedIndex = 0;
  document.getElementById('fDificultad').selectedIndex = 0;

  ['utensiliosList','ingredientesList','pasosList'].forEach(id => {
    const list = document.getElementById(id);
    while (list.children.length > 1) list.lastChild.remove();
    list.querySelector('input').value = '';
  });

  imageData = null;
  imageName = '';
  document.getElementById('imagePreview').style.display = 'none';
  document.querySelector('#uploadZone p').textContent = '📷 Arrastra una imagen aquí o haz clic para seleccionar';
  document.getElementById('imageInput').value = '';

  updatePreview();
}

/* ── Toast ─────────────────────────────── */
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast', 3500);
}

/* ══════════════════════════════════════════
   RECIPE MANAGER TAB
   ══════════════════════════════════════════ */

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_REPO = 'OneUPSolar/KPK-Wellness';
let allRecipeIds = [];
let recipeConfigData = null;

/* ── Tab Switching ────────────────────── */
function switchTab(tab) {
  const createTab = document.querySelector('.main:not(#manageTab)');
  const manageTab = document.getElementById('manageTab');
  const tabLinks = document.querySelectorAll('.tab-link');

  tabLinks.forEach(t => t.classList.remove('active'));

  if (tab === 'manage') {
    createTab.style.display = 'none';
    manageTab.style.display = 'grid';
    tabLinks[1].classList.add('active');
    loadRecipeManager();
  } else {
    createTab.style.display = 'grid';
    manageTab.style.display = 'none';
    tabLinks[0].classList.add('active');
  }
}

/* ── Load Recipe Manager Data ─────────── */
async function loadRecipeManager() {
  const list = document.getElementById('recipeToggleList');
  list.innerHTML = '<li style="padding:20px;text-align:center;color:#999">Cargando recetas...</li>';

  try {
    // Load recipe config from API
    const configRes = await fetch(`${API_URL}/recipe-config`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    if (configRes.ok) {
      recipeConfigData = await configRes.json();
    } else {
      // Fallback: load from GitHub directly
      const ghRes = await fetch(
        `https://raw.githubusercontent.com/${GITHUB_REPO}/main/content/recipe-config.json?t=${Date.now()}`
      );
      recipeConfigData = ghRes.ok ? await ghRes.json() : { freeRecipes: [], categories: {} };
    }

    // Load all recipe file IDs
    allRecipeIds = [];
    const categories = ['desayunos', 'ensaladas', 'pastas', 'postres'];

    for (const cat of categories) {
      try {
        const res = await fetch(
          `${GITHUB_API_URL}/repos/${GITHUB_REPO}/contents/content/recetas/${cat}`
        );
        if (!res.ok) continue;
        const files = await res.json();
        const mdFiles = files.filter(f => f.name.endsWith('.md'));

        for (const file of mdFiles) {
          const id = file.name.replace('.md', '');
          // Read the file to get the recipe name
          let name = id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          try {
            const mdRes = await fetch(file.download_url);
            if (mdRes.ok) {
              const md = await mdRes.text();
              const titleMatch = md.match(/^# (.+)/m);
              if (titleMatch) name = titleMatch[1].trim();
            }
          } catch(e) {}

          allRecipeIds.push({ id, name, category: cat });
        }
      } catch(e) {}
    }

    renderRecipeToggles();
    updateManagerStats();
  } catch(e) {
    list.innerHTML = '<li style="padding:20px;text-align:center;color:#c0392b">Error cargando recetas</li>';
  }
}

/* ── Render Toggle List ───────────────── */
function renderRecipeToggles() {
  const list = document.getElementById('recipeToggleList');
  const freeSet = new Set(recipeConfigData?.freeRecipes || []);

  if (allRecipeIds.length === 0) {
    list.innerHTML = '<li style="padding:20px;text-align:center;color:#999">No se encontraron recetas</li>';
    return;
  }

  const catEmojis = { desayunos: '🍳', ensaladas: '🥗', pastas: '🍝', postres: '🍰' };

  list.innerHTML = allRecipeIds.map(r => `
    <li class="recipe-toggle-item">
      <div>
        <div class="recipe-toggle-name">${r.name}</div>
        <div class="recipe-toggle-cat">${catEmojis[r.category] || ''} ${r.category}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-recipe-id="${r.id}" ${freeSet.has(r.id) ? 'checked' : ''} onchange="onToggleChange()">
        <span class="toggle-slider"></span>
      </label>
    </li>
  `).join('');
}

/* ── Toggle Change Handler ────────────── */
function onToggleChange() {
  updateManagerStats();
  updateConfigPreview();
}

/* ── Update Stats ─────────────────────── */
function updateManagerStats() {
  const toggles = document.querySelectorAll('#recipeToggleList input[type="checkbox"]');
  const total = toggles.length;
  const free = Array.from(toggles).filter(t => t.checked).length;
  const locked = total - free;

  document.getElementById('mgrTotalCount').textContent = total;
  document.getElementById('mgrFreeCount').textContent = free;
  document.getElementById('mgrLockedCount').textContent = locked;

  updateConfigPreview();
}

/* ── Update Config Preview ────────────── */
function updateConfigPreview() {
  const toggles = document.querySelectorAll('#recipeToggleList input[type="checkbox"]');
  const freeRecipes = Array.from(toggles)
    .filter(t => t.checked)
    .map(t => t.dataset.recipeId);

  const preview = {
    freeRecipes,
    categories: recipeConfigData?.categories || {
      desayunos: { emoji: '🍳', en: 'Breakfasts', es: 'Desayunos' },
      ensaladas: { emoji: '🥗', en: 'Salads', es: 'Ensaladas' },
      pastas: { emoji: '🍝', en: 'Pastas', es: 'Pastas' },
      postres: { emoji: '🍰', en: 'Desserts', es: 'Postres' }
    }
  };

  const el = document.getElementById('configPreview');
  if (el) el.textContent = JSON.stringify(preview, null, 2);
}

/* ── Bulk Toggle ──────────────────────── */
function bulkToggle(checked) {
  document.querySelectorAll('#recipeToggleList input[type="checkbox"]').forEach(t => {
    t.checked = checked;
  });
  updateManagerStats();
}

/* ── Save Recipe Config ───────────────── */
async function saveRecipeConfig() {
  const toggles = document.querySelectorAll('#recipeToggleList input[type="checkbox"]');
  const freeRecipes = Array.from(toggles)
    .filter(t => t.checked)
    .map(t => t.dataset.recipeId);

  const config = {
    freeRecipes,
    categories: recipeConfigData?.categories || {
      desayunos: { emoji: '🍳', en: 'Breakfasts', es: 'Desayunos' },
      ensaladas: { emoji: '🥗', en: 'Salads', es: 'Ensaladas' },
      pastas: { emoji: '🍝', en: 'Pastas', es: 'Pastas' },
      postres: { emoji: '🍰', en: 'Desserts', es: 'Postres' }
    }
  };

  try {
    const res = await fetch(`${API_URL}/recipe-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify(config)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save');
    }

    recipeConfigData = config;
    showToast('✅ Configuración guardada exitosamente');
  } catch(e) {
    if (e.message.includes('No autorizada')) {
      showToast('Sesión expirada — inicia sesión de nuevo', true);
      logout();
    } else {
      showToast(`Error: ${e.message}`, true);
    }
  }
}
