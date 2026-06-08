/* =============================================
   POKÉDEX — script.js
   ============================================= */

'use strict';

// ── Constantes ──────────────────────────────────
const API_BASE      = 'https://pokeapi.co/api/v2';
const PAGE_SIZE     = 40;   // quantos carregar por vez
const MAX_POKEMON   = 1025; // total de pokémons na API

// Mapeamento tipo → cor BEM (.type--xxx)
const TYPE_COLORS = {
  fire: '#ff5722', water: '#2196f3', grass: '#4caf50',
  electric: '#ffc107', ice: '#00bcd4', fighting: '#c62828',
  poison: '#9c27b0', ground: '#8d6e63', flying: '#7986cb',
  psychic: '#e91e63', bug: '#8bc34a', rock: '#9e9e9e',
  ghost: '#673ab7', dragon: '#3f51b5', dark: '#424242',
  steel: '#78909c', fairy: '#f48fb1', normal: '#a5a5a5',
};

// Mapeamento stat → cor da barra
const STAT_COLORS = {
  hp: '#ff5959', attack: '#f5ac78', defense: '#fae078',
  'special-attack': '#9db7f5', 'special-defense': '#a7db8d',
  speed: '#fa92b2',
};

// Nomes amigáveis das stats
const STAT_NAMES = {
  hp: 'HP', attack: 'ATK', defense: 'DEF',
  'special-attack': 'SP.ATK', 'special-defense': 'SP.DEF',
  speed: 'VEL',
};

// ── Estado da aplicação ──────────────────────────
let allPokemonList   = [];   // lista completa [{name, url}]
let filteredList     = [];   // lista após filtro de tipo/busca
let displayedList    = [];   // lista de cards renderizados
let offset           = 0;    // paginação
let isSearchMode     = false;
let activeTypeFilter = null;
let currentModalId   = null; // id do pokémon aberto no modal

// ── Elementos do DOM ─────────────────────────────
const grid        = document.getElementById('pokemon-grid');
const loader      = document.getElementById('loader');
const emptyState  = document.getElementById('empty-state');
const emptyMsg    = document.getElementById('empty-state-msg');
const statusText  = document.getElementById('status-text');
const clearBtn    = document.getElementById('clear-btn');
const allBtn      = document.getElementById('all-btn');
const loadMoreBtn = document.getElementById('load-more-btn');
const pagination  = document.getElementById('pagination');
const typeFilters = document.getElementById('type-filters');

// ── Inicialização ────────────────────────────────
(async function init() {
  showLoader(true);
  await fetchAllPokemonList();
  buildTypeFilters();
  filteredList = [...allPokemonList];
  await renderPage();
  showLoader(false);
})();

/* ─────────────────────────────────────────────────
   FETCH: lista completa de pokémons
───────────────────────────────────────────────── */
async function fetchAllPokemonList() {
  try {
    const res  = await fetch(`${API_BASE}/pokemon?limit=${MAX_POKEMON}&offset=0`);
    const data = await res.json();
    allPokemonList = data.results; // [{name, url}]
  } catch (err) {
    console.error('Erro ao buscar lista:', err);
    showEmptyState('Erro ao carregar a Pokédex. Recarregue a página.');
  }
}

/* ─────────────────────────────────────────────────
   FETCH: dados de um pokémon individual
───────────────────────────────────────────────── */
async function fetchPokemon(nameOrId) {
  const res = await fetch(`${API_BASE}/pokemon/${nameOrId}`);
  if (!res.ok) throw new Error(`Pokémon "${nameOrId}" não encontrado.`);
  return res.json();
}

/* ─────────────────────────────────────────────────
   RENDERIZAÇÃO: página de cards (com paginação)
───────────────────────────────────────────────── */
async function renderPage(reset = false) {
  if (reset) {
    grid.innerHTML = '';
    displayedList  = [];
    offset         = 0;
    hide(pagination);
    hide(loadMoreBtn);
    hideEmptyState();
  }

  // Checa lista vazia ANTES de qualquer fetch
  if (filteredList.length === 0) {
    showEmptyState('Nenhum Pokémon encontrado. Tente outro nome ou número.');
    updateStatus();
    return;
  }

  hideEmptyState();

  const slice = filteredList.slice(offset, offset + PAGE_SIZE);

  // Não há mais itens para carregar
  if (slice.length === 0) {
    hide(pagination);
    hide(loadMoreBtn);
    updateStatus();
    return;
  }

  offset += slice.length;
  updateStatus();

  // Busca paralela dos dados dos pokémons da fatia
  const promises = slice.map(p => fetchPokemon(p.name).catch(() => null));
  const results  = await Promise.all(promises);

  const fragment = document.createDocumentFragment();
  results.forEach(data => {
    if (data) {
      displayedList.push(data);
      fragment.appendChild(createCard(data));
    }
  });
  grid.appendChild(fragment);

  // Mostra "Carregar mais" só se houver mais itens E não for modo busca
  const temMais = offset < filteredList.length;
  if (temMais && !isSearchMode) {
    show(pagination);
    show(loadMoreBtn);
  } else {
    hide(pagination);
    hide(loadMoreBtn);
  }
}

/* ─────────────────────────────────────────────────
   CRIAR CARD
───────────────────────────────────────────────── */
function createCard(data) {
  const primaryType = data.types[0]?.type.name || 'normal';
  const typeColor   = TYPE_COLORS[primaryType] || '#aaa';
  const bgColor     = hexToRgba(typeColor, 0.15);

  const article = document.createElement('article');
  article.className = 'card';
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '0');
  article.setAttribute('aria-label', `Ver detalhes de ${data.name}`);
  article.style.setProperty('--card-bg', bgColor);

  // Imagem: oficial artwork ou sprite padrão como fallback
  const imgSrc = data.sprites.other?.['official-artwork']?.front_default
               || data.sprites.front_default
               || '';

  article.innerHTML = `
    <div class="card__bg">
      <span class="card__id" aria-label="Número ${data.id}">#${String(data.id).padStart(3,'0')}</span>
      <img
        class="card__img"
        src="${imgSrc}"
        alt="Imagem de ${data.name}"
        loading="lazy"
        onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'"
      />
    </div>
    <h2 class="card__name">${data.name}</h2>
    <div class="card__types" aria-label="Tipos">
      ${data.types.map(t => typeBadge(t.type.name)).join('')}
    </div>
  `;

  // Abrir modal ao clicar ou pressionar Enter/Space
  article.addEventListener('click', () => openModal(data.id));
  article.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(data.id); }
  });

  return article;
}

/* ─────────────────────────────────────────────────
   BUSCA
───────────────────────────────────────────────── */
async function handleSearch(event) {
  event.preventDefault();
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  if (!query) { clearSearch(); return; }

  showLoader(true);
  grid.innerHTML = '';
  hideEmptyState();

  // Tenta busca exata na API primeiro
  try {
    const data = await fetchPokemon(query);
    isSearchMode = true;
    filteredList = [{ name: data.name, url: '' }];
    displayedList = [data];
    offset = 1;
    grid.appendChild(createCard(data));
    updateStatus();
    pagination.hidden = true;
    clearBtn.hidden   = false;
  } catch {
    // Fallback: filtro por nome parcial na lista local
    const results = allPokemonList.filter(p => p.name.includes(query));
    if (results.length === 0) {
      filteredList = [];
      showEmptyState(`Pokémon "${query}" não encontrado. Verifique o nome ou número.`);
      pagination.hidden = true;
      clearBtn.hidden   = false;
      updateStatus();
    } else {
      isSearchMode = true;
      filteredList = results;
      clearBtn.hidden = false;
      await renderPage(true);
    }
  }

  showLoader(false);
}

/* ─────────────────────────────────────────────────
   LIMPAR BUSCA → volta listagem completa
───────────────────────────────────────────────── */
async function clearSearch() {
  document.getElementById('search-input').value = '';
  isSearchMode    = false;
  activeTypeFilter = null;
  clearBtn.hidden  = true;
  if (allBtn) allBtn.hidden = true;
  filteredList     = [...allPokemonList];

  // Reseta filtros de tipo
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('is-active'));

  showLoader(true);
  await renderPage(true);
  showLoader(false);
}

/* ─────────────────────────────────────────────────
   CARREGAR MAIS (paginação)
───────────────────────────────────────────────── */
async function loadMore() {
  showLoader(true);
  await renderPage();
  showLoader(false);
}

/* ─────────────────────────────────────────────────
   FILTRO POR TIPO
───────────────────────────────────────────────── */
function buildTypeFilters() {
  const types = Object.keys(TYPE_COLORS);
  const frag  = document.createDocumentFragment();

  types.forEach(type => {
    const btn = document.createElement('button');
    btn.className = `filter-btn type--${type}`;
    btn.textContent = type;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `Filtrar por tipo ${type}`);
    btn.style.setProperty('--type-color', TYPE_COLORS[type]);
    btn.addEventListener('click', () => filterByType(type, btn));
    frag.appendChild(btn);
  });

  typeFilters.appendChild(frag);
}

async function filterByType(type, btn) {
  // Toggle
  if (activeTypeFilter === type) {
    activeTypeFilter = null;
    btn.classList.remove('is-active');
    btn.setAttribute('aria-pressed', 'false');
    filteredList = [...allPokemonList];
  } else {
    // Desativa anterior
    document.querySelectorAll('.filter-btn.is-active').forEach(b => {
      b.classList.remove('is-active');
      b.setAttribute('aria-pressed', 'false');
    });
    activeTypeFilter = type;
    btn.classList.add('is-active');
    btn.setAttribute('aria-pressed', 'true');

    // Filtra: precisa buscar dados individuais (a list não tem tipo)
    // Usamos a endpoint de tipo da API
    showLoader(true);
    try {
      const res  = await fetch(`${API_BASE}/type/${type}`);
      const data = await res.json();
      const names = new Set(data.pokemon.map(p => p.pokemon.name));
      filteredList = allPokemonList.filter(p => names.has(p.name));
    } catch {
      filteredList = [...allPokemonList];
    }
  }

  isSearchMode    = activeTypeFilter !== null;
  clearBtn.hidden = activeTypeFilter === null;
  if (allBtn) allBtn.hidden = activeTypeFilter === null;
  document.getElementById('search-input').value = '';

  showLoader(true);
  await renderPage(true);
  showLoader(false);
}

/* ─────────────────────────────────────────────────
   MODAL: abrir
───────────────────────────────────────────────── */
async function openModal(pokemonId) {
  currentModalId = pokemonId;
  const overlay  = document.getElementById('modal-overlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  // Limpa conteúdo anterior
  document.getElementById('modal-img').src = '';

  try {
    const data = await fetchPokemon(pokemonId);
    populateModal(data);
  } catch {
    closeModal();
    alert('Não foi possível carregar os detalhes deste Pokémon.');
  }
}

/* ─────────────────────────────────────────────────
   MODAL: popular com dados
───────────────────────────────────────────────── */
function populateModal(data) {
  const primaryType = data.types[0]?.type.name || 'normal';
  const typeColor   = TYPE_COLORS[primaryType] || '#aaa';
  const bgColor     = hexToRgba(typeColor, 0.2);

  // Header
  document.getElementById('modal-header').style.background = bgColor;
  document.getElementById('modal-id').textContent   = `#${String(data.id).padStart(3,'0')}`;
  document.getElementById('modal-pokemon-name').textContent = data.name;

  // Tipos
  const typesEl = document.getElementById('modal-types');
  typesEl.innerHTML = data.types.map(t => typeBadge(t.type.name)).join('');

  // Imagem oficial ou sprite
  const imgSrc = data.sprites.other?.['official-artwork']?.front_default
               || data.sprites.front_default || '';
  const img = document.getElementById('modal-img');
  img.src = imgSrc;
  img.alt = `Imagem oficial de ${data.name}`;

  // Altura e Peso (converter unidades)
  document.getElementById('modal-height').textContent =
    `${(data.height / 10).toFixed(1)} m`;
  document.getElementById('modal-weight').textContent =
    `${(data.weight / 10).toFixed(1)} kg`;
  document.getElementById('modal-exp').textContent =
    data.base_experience ?? '—';

  // Habilidades
  const abilitiesEl = document.getElementById('modal-abilities');
  abilitiesEl.innerHTML = data.abilities.map(a => {
    const hidden = a.is_hidden ? ' ability-badge--hidden" title="Habilidade oculta' : '';
    return `<span class="ability-badge${hidden}">${a.ability.name}</span>`;
  }).join('');

  // Estatísticas de batalha
  const statsEl = document.getElementById('modal-stats');
  statsEl.innerHTML = data.stats.map(s => {
    const name  = s.stat.name;
    const val   = s.base_stat;
    const pct   = Math.min((val / 255) * 100, 100).toFixed(1);
    const color = STAT_COLORS[name] || '#aaa';
    const label = STAT_NAMES[name] || name;
    return `
      <li class="stat-item">
        <div class="stat-item__header">
          <span class="stat-item__name">${label}</span>
          <span class="stat-item__val">${val}</span>
        </div>
        <div class="stat-bar" role="progressbar" aria-valuenow="${val}" aria-valuemin="0" aria-valuemax="255">
          <div class="stat-bar__fill" style="width:${pct}%; --stat-color:${color};"></div>
        </div>
      </li>`;
  }).join('');

  // Botões anterior / próximo
  document.getElementById('modal-prev').disabled = data.id <= 1;
  document.getElementById('modal-next').disabled = data.id >= MAX_POKEMON;
}

/* ─────────────────────────────────────────────────
   MODAL: navegar entre pokémons
───────────────────────────────────────────────── */
async function navigateModal(direction) {
  const newId = currentModalId + direction;
  if (newId < 1 || newId > MAX_POKEMON) return;
  await openModal(newId);
}

/* ─────────────────────────────────────────────────
   MODAL: fechar
───────────────────────────────────────────────── */
function closeModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.body.style.overflow = '';
  currentModalId = null;
}

function closeModalOnOverlay(event) {
  if (event.target === document.getElementById('modal-overlay')) closeModal();
}

// Fechar com tecla ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

/* ─────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────── */

// Gera badge HTML de tipo
function typeBadge(typeName) {
  const color = TYPE_COLORS[typeName] || '#aaa';
  return `<span class="type-badge type--${typeName}" style="--type-color:${color}">${typeName}</span>`;
}

// Converte hex → rgba
function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Exibe/oculta loader
function showLoader(visible) {
  loader.hidden = !visible;
}

// ── helpers de visibilidade seguros (evita conflito CSS display x hidden) ──
function show(el) { el.hidden = false; }
function hide(el) { el.hidden = true;  }

// Exibe estado vazio com mensagem
function showEmptyState(msg) {
  emptyMsg.textContent = msg;
  show(emptyState);
  // SEMPRE esconde paginação junto
  hide(pagination);
  hide(loadMoreBtn);
}

function hideEmptyState() {
  hide(emptyState);
}

// Atualiza texto de status
function updateStatus() {
  const showing = grid.children.length;
  const total   = filteredList.length;

  if (isSearchMode) {
    statusText.textContent = `${total} Pokémon(s) encontrado(s)`;
  } else {
    statusText.textContent = `Exibindo ${showing} de ${total} Pokémons`;
  }
}
