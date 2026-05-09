/* KPK Wellness — Recipe Admin JS */
const REPO = 'OneUPSolar/KPK-Wellness';
const API  = 'https://api.github.com';
let TOKEN  = '';
let imageData = null;
let imageName = '';

/* ── Auth ─────────────────────────────── */
function authenticate() {
  const t = document.getElementById('tokenInput').value.trim();
  if (!t) return;
  TOKEN = t;
  fetch(`${API}/repos/${REPO}`, { headers: authHeaders() })
    .then(r => {
      if (!r.ok) throw new Error('bad');
      localStorage.setItem('kpk_token', t);
      showApp();
    })
    .catch(() => {
      document.getElementById('authError').style.display = 'block';
    });
}

function logout() {
  localStorage.removeItem('kpk_token');
  TOKEN = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('tokenInput').value = '';
}

function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github.v3+json' };
}

/* Auto-login */
(function() {
  const saved = localStorage.getItem('kpk_token');
  if (saved) { TOKEN = saved; showApp(); }
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
    imageData = ev.target.result.split(',')[1]; // base64 without prefix
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

/* ── GitHub Commit ────────────────────── */
async function commitFile(path, content, message, isBase64) {
  const body = {
    message,
    content: isBase64 ? content : btoa(unescape(encodeURIComponent(content)))
  };

  // Check if file exists (for update)
  try {
    const existing = await fetch(`${API}/repos/${REPO}/contents/${path}`, { headers: authHeaders() });
    if (existing.ok) {
      const data = await existing.json();
      body.sha = data.sha;
    }
  } catch(e) { /* new file */ }

  const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Commit failed');
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
    showToast(`Error: ${e.message}`, true);
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
