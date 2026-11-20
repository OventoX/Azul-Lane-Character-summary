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
    lightboxStage: document.getElementById('lightboxStage'),
    lightboxCloseBtn: document.getElementById('lightboxCloseBtn'),
    lightboxPrevImgBtn: document.getElementById('lightboxPrevImgBtn'),
    lightboxNextImgBtn: document.getElementById('lightboxNextImgBtn'),
    lightboxPrevCharBtn: document.getElementById('lightboxPrevCharBtn'),
    lightboxNextCharBtn: document.getElementById('lightboxNextCharBtn'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxCaption: document.getElementById('lightboxCaption'),
  };

  const lightboxState = {
    scale: 1,
    tx: 0,
    ty: 0,
    isPinching: false,
    isPanning: false,
    isMousePanning: false,
    swipeCancelled: false,
    movedDuringTouch: false,
    touchStartX: 0,
    touchStartY: 0,
    pinchStartDist: 0,
    pinchStartScale: 1,
    pinchStartTx: 0,
    pinchStartTy: 0,
    pinchStartMidX: 0,
    pinchStartMidY: 0,
    panStartTx: 0,
    panStartTy: 0,
    mouseStartX: 0,
    mouseStartY: 0,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
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
      mainWrap.addEventListener('click', () => openLightbox());
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

  function clampLightboxZoom(scale, tx, ty) {
    const s = Math.max(1, Math.min(4, scale));
    if (s <= 1.01) {
      return { scale: 1, tx: 0, ty: 0 };
    }
    const stage = els.lightboxStage;
    const lbImg = els.lightboxImg;
    if (!stage || !lbImg || !lbImg.offsetWidth || !lbImg.offsetHeight) {
      return { scale: s, tx, ty };
    }
    const maxX = Math.max(0, (lbImg.offsetWidth * s - stage.clientWidth) / 2);
    const maxY = Math.max(0, (lbImg.offsetHeight * s - stage.clientHeight) / 2);
    return {
      scale: s,
      tx: Math.max(-maxX, Math.min(maxX, tx)),
      ty: Math.max(-maxY, Math.min(maxY, ty)),
    };
  }

  function applyLightboxTransform(animate = false) {
    const lbImg = els.lightboxImg;
    if (!lbImg) return;
    lbImg.style.transition = animate ? 'transform 0.18s ease-out' : 'none';
    lbImg.style.transform = `translate3d(${lightboxState.tx}px, ${lightboxState.ty}px, 0) scale(${lightboxState.scale})`;
    lbImg.style.cursor = lightboxState.scale > 1 ? 'grab' : 'default';
  }

  function resetLightboxZoom() {
    lightboxState.scale = 1;
    lightboxState.tx = 0;
    lightboxState.ty = 0;
    lightboxState.isPinching = false;
    lightboxState.isPanning = false;
    lightboxState.isMousePanning = false;
    lightboxState.swipeCancelled = false;
    lightboxState.movedDuringTouch = false;
    applyLightboxTransform(false);
  }

  function getTouchDistAndMid(t1, t2, stageRect) {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    const cx = stageRect.left + stageRect.width / 2;
    const cy = stageRect.top + stageRect.height / 2;
    return {
      dist: Math.hypot(dx, dy) || 1,
      midX: (t1.clientX + t2.clientX) / 2 - cx,
      midY: (t1.clientY + t2.clientY) / 2 - cy,
    };
  }

  function updateLightboxView() {
    const s = currentModalShip;
    if (!s || !s.images || !s.images.length) return;
    const total = s.images.length;
    if (currentImgIndex < 0) currentImgIndex = 0;
    if (currentImgIndex >= total) currentImgIndex = total - 1;

    const img = s.images[currentImgIndex];
    els.lightboxImg.src = img.url;
    els.lightboxImg.alt = `${s.name} — ${img.label}`;
    els.lightboxCaption.textContent = `${s.name} — ${img.label} (${currentImgIndex + 1}/${total})`;

    const single = total <= 1;
    els.lightboxPrevImgBtn.classList.toggle('disabled', single);
    els.lightboxNextImgBtn.classList.toggle('disabled', single);
    resetLightboxZoom();
  }

  function openLightbox() {
    if (!currentModalShip || !currentModalShip.images || !currentModalShip.images.length) return;
    updateLightboxView();
    els.lightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    resetLightboxZoom();
    els.lightbox.classList.add('hidden');
    els.lightboxImg.src = '';
  }

  function stepLightboxImage(delta) {
    const s = currentModalShip;
    if (!s || !s.images || s.images.length <= 1) return;
    const total = s.images.length;
    currentImgIndex = (currentImgIndex + delta + total) % total;
    renderModalContent();
    if (!els.lightbox.classList.contains('hidden')) {
      updateLightboxView();
    }
  }

  function navigateCharacter(delta) {
    if (!currentModalShip) return;
    const list = getFilteredShips();
    if (list.length <= 1) return;
    const idx = list.findIndex(s => s.id === currentModalShip.id);
    if (idx === -1) return;
    const nextIdx = (idx + delta + list.length) % list.length;
    currentModalShip = list[nextIdx];
    currentImgIndex = 0;
    renderModalContent();
    if (!els.lightbox.classList.contains('hidden')) {
      updateLightboxView();
    }
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
  els.lightboxPrevImgBtn.addEventListener('click', e => { e.stopPropagation(); stepLightboxImage(-1); });
  els.lightboxNextImgBtn.addEventListener('click', e => { e.stopPropagation(); stepLightboxImage(1); });
  els.lightboxPrevCharBtn.addEventListener('click', e => { e.stopPropagation(); navigateCharacter(-1); });
  els.lightboxNextCharBtn.addEventListener('click', e => { e.stopPropagation(); navigateCharacter(1); });

  els.lightboxStage.addEventListener('click', e => {
    if (e.target === els.lightboxStage) closeLightbox();
  });

  // Touch pinch zoom, 1-finger pan, double-tap (1x <-> 2.5x), 1x horizontal swipe for character nav
  els.lightboxStage.addEventListener('touchstart', e => {
    if (!e.touches) return;
    if (e.touches.length === 2) {
      lightboxState.swipeCancelled = true;
      lightboxState.isPanning = false;
      lightboxState.isPinching = true;
      lightboxState.movedDuringTouch = true;
      const rect = els.lightboxStage.getBoundingClientRect();
      const { dist, midX, midY } = getTouchDistAndMid(e.touches[0], e.touches[1], rect);
      lightboxState.pinchStartDist = dist;
      lightboxState.pinchStartScale = lightboxState.scale;
      lightboxState.pinchStartTx = lightboxState.tx;
      lightboxState.pinchStartTy = lightboxState.ty;
      lightboxState.pinchStartMidX = midX;
      lightboxState.pinchStartMidY = midY;
    } else if (e.touches.length === 1) {
      lightboxState.touchStartX = e.touches[0].clientX;
      lightboxState.touchStartY = e.touches[0].clientY;
      lightboxState.movedDuringTouch = false;
      lightboxState.swipeCancelled = false;
      if (lightboxState.scale > 1) {
        lightboxState.isPanning = true;
        lightboxState.panStartTx = lightboxState.tx;
        lightboxState.panStartTy = lightboxState.ty;
      } else {
        lightboxState.isPanning = false;
      }
    }
  }, { passive: true });

  els.lightboxStage.addEventListener('touchmove', e => {
    if (!e.touches) return;
    if (lightboxState.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const rect = els.lightboxStage.getBoundingClientRect();
      const { dist, midX, midY } = getTouchDistAndMid(e.touches[0], e.touches[1], rect);
      const s0 = lightboxState.pinchStartScale;
      const rawScale = s0 * (dist / lightboxState.pinchStartDist);
      const s1 = Math.max(1, Math.min(4, rawScale));
      const ratio = s1 / s0;
      const rawTx = midX - (lightboxState.pinchStartMidX - lightboxState.pinchStartTx) * ratio;
      const rawTy = midY - (lightboxState.pinchStartMidY - lightboxState.pinchStartTy) * ratio;
      const clamped = clampLightboxZoom(s1, rawTx, rawTy);
      lightboxState.scale = clamped.scale;
      lightboxState.tx = clamped.tx;
      lightboxState.ty = clamped.ty;
      applyLightboxTransform(false);
    } else if (lightboxState.isPanning && e.touches.length === 1 && lightboxState.scale > 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - lightboxState.touchStartX;
      const dy = e.touches[0].clientY - lightboxState.touchStartY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        lightboxState.movedDuringTouch = true;
      }
      const clamped = clampLightboxZoom(lightboxState.scale, lightboxState.panStartTx + dx, lightboxState.panStartTy + dy);
      lightboxState.tx = clamped.tx;
      lightboxState.ty = clamped.ty;
      applyLightboxTransform(false);
    } else if (e.touches.length === 1 && lightboxState.scale === 1) {
      const dx = e.touches[0].clientX - lightboxState.touchStartX;
      const dy = e.touches[0].clientY - lightboxState.touchStartY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        lightboxState.movedDuringTouch = true;
      }
    }
  }, { passive: false });

  els.lightboxStage.addEventListener('touchend', e => {
    if (lightboxState.isPinching) {
      if (!e.touches || e.touches.length === 0) {
        lightboxState.isPinching = false;
      } else if (e.touches.length === 1) {
        lightboxState.isPinching = false;
        lightboxState.swipeCancelled = true;
        if (lightboxState.scale > 1) {
          lightboxState.isPanning = true;
          lightboxState.touchStartX = e.touches[0].clientX;
          lightboxState.touchStartY = e.touches[0].clientY;
          lightboxState.panStartTx = lightboxState.tx;
          lightboxState.panStartTy = lightboxState.ty;
        }
      }
      return;
    }

    if (lightboxState.isPanning) {
      lightboxState.isPanning = false;
    }

    if (!e.touches || e.touches.length === 0) {
      const changed = e.changedTouches && e.changedTouches[0];
      if (!changed) return;

      // Double-tap zoom toggle (1x <-> 2.5x)
      if (!lightboxState.swipeCancelled && !lightboxState.movedDuringTouch) {
        const now = Date.now();
        const tapDist = Math.hypot(changed.clientX - lightboxState.lastTapX, changed.clientY - lightboxState.lastTapY);
        if (now - lightboxState.lastTapTime < 300 && tapDist < 35) {
          lightboxState.lastTapTime = 0;
          if (lightboxState.scale > 1) {
            lightboxState.scale = 1;
            lightboxState.tx = 0;
            lightboxState.ty = 0;
            applyLightboxTransform(true);
          } else {
            const rect = els.lightboxStage.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const tapX = changed.clientX - cx;
            const tapY = changed.clientY - cy;
            const targetScale = 2.5;
            const clamped = clampLightboxZoom(targetScale, -tapX * (targetScale - 1), -tapY * (targetScale - 1));
            lightboxState.scale = clamped.scale;
            lightboxState.tx = clamped.tx;
            lightboxState.ty = clamped.ty;
            applyLightboxTransform(true);
          }
          return;
        }
        lightboxState.lastTapTime = now;
        lightboxState.lastTapX = changed.clientX;
        lightboxState.lastTapY = changed.clientY;
      }

      // 1x horizontal swipe: prev/next character
      if (!lightboxState.swipeCancelled && lightboxState.scale === 1 && lightboxState.touchStartX) {
        const dx = changed.clientX - lightboxState.touchStartX;
        lightboxState.touchStartX = 0;
        if (Math.abs(dx) > 45) {
          navigateCharacter(dx < 0 ? 1 : -1);
        }
      }
    }
  }, { passive: true });

  // PC mouse wheel zoom & drag pan on lightbox stage
  els.lightboxStage.addEventListener('wheel', e => {
    if (els.lightbox.classList.contains('hidden')) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const s0 = lightboxState.scale;
    const s1 = Math.max(1, Math.min(4, s0 * factor));
    const clamped = clampLightboxZoom(s1, lightboxState.tx * (s1 / s0), lightboxState.ty * (s1 / s0));
    lightboxState.scale = clamped.scale;
    lightboxState.tx = clamped.tx;
    lightboxState.ty = clamped.ty;
    applyLightboxTransform(false);
  }, { passive: false });

  els.lightboxImg.addEventListener('mousedown', e => {
    if (lightboxState.scale <= 1) return;
    e.preventDefault();
    lightboxState.isMousePanning = true;
    lightboxState.mouseStartX = e.clientX;
    lightboxState.mouseStartY = e.clientY;
    lightboxState.panStartTx = lightboxState.tx;
    lightboxState.panStartTy = lightboxState.ty;
    els.lightboxImg.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!lightboxState.isMousePanning) return;
    const dx = e.clientX - lightboxState.mouseStartX;
    const dy = e.clientY - lightboxState.mouseStartY;
    const clamped = clampLightboxZoom(lightboxState.scale, lightboxState.panStartTx + dx, lightboxState.panStartTy + dy);
    lightboxState.tx = clamped.tx;
    lightboxState.ty = clamped.ty;
    applyLightboxTransform(false);
  });

  window.addEventListener('mouseup', () => {
    if (lightboxState.isMousePanning) {
      lightboxState.isMousePanning = false;
      els.lightboxImg.style.cursor = lightboxState.scale > 1 ? 'grab' : 'default';
    }
  });

  document.addEventListener('keydown', e => {
    const lbOpen = !els.lightbox.classList.contains('hidden');
    const modalOpen = !els.detailModal.classList.contains('hidden');
    if (e.key === 'Escape') {
      if (lbOpen) closeLightbox();
      else if (modalOpen) closeModal();
      return;
    }
    if (!lbOpen && !modalOpen) return;
    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateCharacter(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateCharacter(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepLightboxImage(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepLightboxImage(1);
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
