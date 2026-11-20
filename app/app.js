(() => {
  'use strict';

  const FAV_STORAGE_KEY = 'azurlane_matome_favorites_v1';
  const ships = typeof SHIPS_DATA !== 'undefined' ? SHIPS_DATA : [];

  let favorites = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(FAV_STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) favorites = new Set(saved);
  } catch {
    favorites = new Set();
  }

  let onlyFav = false;
  let currentModalShip = null;
  let currentImgIndex = 0;

  const els = {
    totalCountPill: document.getElementById('totalCountPill'),
    favCountPill: document.getElementById('favCountPill'),
    searchInput: document.getElementById('searchInput'),
    favFilterBtn: document.getElementById('favFilterBtn'),
    resetBtn: document.getElementById('resetBtn'),
    rarityFilter: document.getElementById('rarityFilter'),
    typeFilter: document.getElementById('typeFilter'),
    factionFilter: document.getElementById('factionFilter'),
    sortSelect: document.getElementById('sortSelect'),
    resultCountText: document.getElementById('resultCountText'),
    shipGrid: document.getElementById('shipGrid'),
    emptyState: document.getElementById('emptyState'),
    detailModal: document.getElementById('detailModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalBody: document.getElementById('modalBody'),
    lightbox: document.getElementById('lightbox'),
    lightboxCloseBtn: document.getElementById('lightboxCloseBtn'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxCaption: document.getElementById('lightboxCaption'),
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify([...favorites]));
    } catch {
      // ignore storage quota errors
    }
    updateHeaderStats();
  }

  function updateHeaderStats() {
    els.totalCountPill.textContent = `収録: ${ships.length} 隻`;
    els.favCountPill.textContent = `お気に入り: ${favorites.size}`;
  }

  function populateFilterOptions() {
    const types = [...new Set(ships.map(s => s.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      els.typeFilter.appendChild(opt);
    });

    const factionOrder = ['ユニオン', 'ロイヤル', '重桜', '鉄血', '東煌', 'サディア', 'アイリス', 'ヴィシア', '北方連合', 'その他・コラボ'];
    const factions = [...new Set(ships.map(s => s.faction).filter(Boolean))].sort((a, b) => {
      const ia = factionOrder.indexOf(a);
      const ib = factionOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b, 'ja');
    });
    factions.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      els.factionFilter.appendChild(opt);
    });
  }

  function getRarityRank(ship) {
    if (ship.plan === 'DR') return 5;
    const map = { UR: 4, SSR: 3, SR: 2, R: 1, N: 0 };
    return map[ship.rarity] ?? -1;
  }

  function getDisplayRarity(ship) {
    return ship.plan ? `${ship.rarity} (${ship.plan})` : ship.rarity;
  }

  function getFilteredShips() {
    const q = els.searchInput.value.trim().toLowerCase();
    const rarity = els.rarityFilter.value;
    const type = els.typeFilter.value;
    const faction = els.factionFilter.value;
    const sort = els.sortSelect.value;

    let list = ships.filter(s => {
      if (onlyFav && !favorites.has(s.id)) return false;
      if (rarity === 'DR' && s.plan !== 'DR') return false;
      if (rarity === 'UR_ONLY' && (s.rarity !== 'UR' || s.plan === 'DR')) return false;
      if (rarity === 'UR' && s.rarity !== 'UR') return false;
      if (type !== 'ALL' && s.type !== type) return false;
      if (faction !== 'ALL' && s.faction !== faction) return false;
      if (q) {
        const hay = `${s.name} ${s.nameEn || ''} ${s.class || ''} ${s.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sort === 'rarity-desc') {
        const diff = getRarityRank(b) - getRarityRank(a);
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id, 'en', { numeric: true });
      }
      if (sort === 'name-asc') {
        return a.name.localeCompare(b.name, 'ja');
      }
      return a.id.localeCompare(b.id, 'en', { numeric: true });
    });

    return list;
  }

  function renderGrid() {
    const list = getFilteredShips();
    els.resultCountText.textContent = `${list.length} / ${ships.length} 隻を表示中`;

    if (list.length === 0) {
      els.shipGrid.innerHTML = '';
      els.emptyState.classList.remove('hidden');
      return;
    }

    els.emptyState.classList.add('hidden');
    els.shipGrid.innerHTML = list.map(s => {
      const thumb = (s.images && s.images[0]) ? s.images[0].url : '';
      const isFav = favorites.has(s.id);
      const badgeClass = s.plan === 'DR' ? 'rarity-dr' : 'rarity-ur';
      const badgeLabel = s.plan === 'DR' ? 'DR' : s.rarity;

      return `
        <article class="ship-card" data-id="${escapeHtml(s.id)}" tabindex="0">
          <div class="card-thumb-wrap">
            ${thumb ? `<img class="card-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(s.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
            <span class="rarity-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
            <button type="button" class="card-fav-btn ${isFav ? 'active' : ''}" data-fav-id="${escapeHtml(s.id)}" aria-label="お気に入り切替" title="お気に入り">${isFav ? '★' : '☆'}</button>
          </div>
          <div class="card-body">
            <div class="card-id">${escapeHtml(s.id)}</div>
            <h2 class="card-name">${escapeHtml(s.name)}</h2>
            <div class="card-name-en">${escapeHtml(s.nameEn || '')}</div>
            <div class="card-tags">
              <span class="tag tag-faction">${escapeHtml(s.faction)}</span>
              <span class="tag">${escapeHtml(s.type)}</span>
              ${s.class ? `<span class="tag">${escapeHtml(s.class)}</span>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function openModal(shipId) {
    const ship = ships.find(s => s.id === shipId);
    if (!ship) return;
    currentModalShip = ship;
    currentImgIndex = 0;
    renderModalContent();
    els.detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    els.detailModal.classList.add('hidden');
    document.body.style.overflow = '';
    currentModalShip = null;
  }

  function renderModalContent() {
    const s = currentModalShip;
    if (!s) return;
    const imgs = s.images && s.images.length ? s.images : [];
    const activeImg = imgs[currentImgIndex] || null;
    const isFav = favorites.has(s.id);
    const badgeClass = s.plan === 'DR' ? 'rarity-dr' : 'rarity-ur';

    const skillsHtml = (s.skills && s.skills.length)
      ? s.skills.map(sk => `
          <div class="skill-item">
            <div class="skill-name">${escapeHtml(sk.name)}</div>
            <div class="skill-desc">${escapeHtml(sk.desc)}</div>
          </div>
        `).join('')
      : '<p style="color: var(--text-muted); font-size: 0.85rem;">スキル情報なし</p>';

    const tabsHtml = imgs.map((img, idx) => `
      <button type="button" class="gallery-tab ${idx === currentImgIndex ? 'active' : ''}" data-img-idx="${idx}">
        ${escapeHtml(img.label)}
      </button>
    `).join('');

    els.modalBody.innerHTML = `
      <div class="modal-grid">
        <div>
          <div class="gallery-main" id="modalMainImgWrap" title="クリックで拡大表示">
            ${activeImg
              ? `<img src="${escapeHtml(activeImg.url)}" alt="${escapeHtml(s.name)} - ${escapeHtml(activeImg.label)}" referrerpolicy="no-referrer">`
              : '<div style="padding: 80px 20px; text-align:center; color: var(--text-muted);">画像なし</div>'}
            ${activeImg ? '<div class="gallery-hint">タップ／クリックで拡大表示</div>' : ''}
          </div>
          ${imgs.length > 1 ? `<div class="gallery-tabs">${tabsHtml}</div>` : ''}
          ${activeImg ? `<p class="gallery-credit">出典: ${escapeHtml(activeImg.source)}<br>${escapeHtml(activeImg.credit)}</p>` : ''}
        </div>

        <div>
          <div class="detail-header">
            <span class="rarity-badge ${badgeClass}" style="position: static;">${escapeHtml(getDisplayRarity(s))}</span>
            <h2 class="detail-title" id="modalTitle">${escapeHtml(s.name)}</h2>
            <button type="button" id="modalFavBtn" class="btn-toggle ${isFav ? 'active' : ''}" style="margin-left:auto;">
              ${isFav ? '★ お気に入り済み' : '☆ お気に入り'}
            </button>
          </div>
          <div class="detail-en">${escapeHtml(s.id)} / ${escapeHtml(s.nameEn || '-')}</div>

          <table class="meta-table">
            <tr><th>陣営</th><td>${escapeHtml(s.faction)}</td></tr>
            <tr><th>艦種</th><td>${escapeHtml(s.type)}</td></tr>
            <tr><th>艦級</th><td>${escapeHtml(s.class || '-')}</td></tr>
            <tr><th>CV</th><td>${escapeHtml(s.cv || '-')}</td></tr>
            <tr><th>イラスト</th><td>${escapeHtml(s.illustrator || '-')}</td></tr>
            <tr><th>入手方法</th><td>${escapeHtml(s.acquisition || '-')}</td></tr>
          </table>

          <h3 class="section-heading">スキル</h3>
          <div class="skill-list">${skillsHtml}</div>

          ${s.sourceInfo ? `
            <div class="source-box">
              <strong>出典:</strong>
              <a href="${escapeHtml(s.sourceInfo.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.sourceInfo.url)}</a>
              <span>（確認日: ${escapeHtml(s.sourceInfo.date)}）</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    const mainWrap = document.getElementById('modalMainImgWrap');
    if (mainWrap && activeImg) {
      mainWrap.addEventListener('click', () => openLightbox(activeImg.url, `${s.name}（${activeImg.label}）`));
    }

    const modalFavBtn = document.getElementById('modalFavBtn');
    if (modalFavBtn) {
      modalFavBtn.addEventListener('click', () => {
        if (favorites.has(s.id)) favorites.delete(s.id);
        else favorites.add(s.id);
        saveFavorites();
        renderModalContent();
        renderGrid();
      });
    }

    els.modalBody.querySelectorAll('.gallery-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentImgIndex = Number(btn.dataset.imgIdx);
        renderModalContent();
      });
    });
  }

  function openLightbox(url, caption) {
    els.lightboxImg.src = url;
    els.lightboxImg.alt = caption;
    els.lightboxCaption.textContent = caption;
    els.lightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    els.lightbox.classList.add('hidden');
    els.lightboxImg.src = '';
  }

  // Event listeners
  els.searchInput.addEventListener('input', renderGrid);
  els.rarityFilter.addEventListener('change', renderGrid);
  els.typeFilter.addEventListener('change', renderGrid);
  els.factionFilter.addEventListener('change', renderGrid);
  els.sortSelect.addEventListener('change', renderGrid);

  els.favFilterBtn.addEventListener('click', () => {
    onlyFav = !onlyFav;
    els.favFilterBtn.classList.toggle('active', onlyFav);
    els.favFilterBtn.setAttribute('aria-pressed', String(onlyFav));
    renderGrid();
  });

  els.resetBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.rarityFilter.value = 'ALL';
    els.typeFilter.value = 'ALL';
    els.factionFilter.value = 'ALL';
    els.sortSelect.value = 'id-asc';
    onlyFav = false;
    els.favFilterBtn.classList.remove('active');
    els.favFilterBtn.setAttribute('aria-pressed', 'false');
    renderGrid();
  });

  els.shipGrid.addEventListener('click', e => {
    const favBtn = e.target.closest('[data-fav-id]');
    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.dataset.favId;
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      saveFavorites();
      renderGrid();
      return;
    }
    const card = e.target.closest('.ship-card');
    if (card) {
      openModal(card.dataset.id);
    }
  });

  els.shipGrid.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.ship-card');
      if (card && !e.target.closest('[data-fav-id]')) {
        e.preventDefault();
        openModal(card.dataset.id);
      }
    }
  });

  els.modalBackdrop.addEventListener('click', closeModal);
  els.modalCloseBtn.addEventListener('click', closeModal);
  els.lightboxCloseBtn.addEventListener('click', closeLightbox);
  els.lightbox.addEventListener('click', e => {
    if (e.target === els.lightbox) closeLightbox();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!els.lightbox.classList.contains('hidden')) closeLightbox();
      else if (!els.detailModal.classList.contains('hidden')) closeModal();
    }
  });

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  populateFilterOptions();
  updateHeaderStats();
  renderGrid();
})();
