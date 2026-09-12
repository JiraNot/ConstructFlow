// ConstructFlow Panel JS — JS↔Ruby Bridge + UI Logic
// Works under SketchUp HtmlDialog (file:// protocol, no fetch)

'use strict';

/* ──────────────────────────────────────────────────────────
   1. RUBY BRIDGE
   SketchUp injects `window.sketchup` object with named
   callbacks registered via dialog.add_action_callback
   ────────────────────────────────────────────────────────── */
const CF = {
  // Send action to Ruby backend
  send(action, params = {}) {
    const payload = JSON.stringify({ action, params });
    if (window.sketchup && typeof window.sketchup[action] === 'function') {
      window.sketchup[action](payload);
    } else if (window.sketchup && typeof window.sketchup.dispatch === 'function') {
      window.sketchup.dispatch(payload);
    } else {
      // Dev mode fallback — log to console
      console.log('[CF→Ruby]', action, params);
      CF.toast(`[DEV] ${action}`, 'info');
    }
  },

  // Called FROM Ruby via dialog.execute_script("CF.receive(payload)")
  receive(payloadStr) {
    try {
      const data = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
      if (data.type === 'state') CF._applyState(data);
      if (data.type === 'selection') CF._renderSelection(data.selected);
      if (data.type === 'toast') CF.toast(data.message, data.level || 'info');
      if (data.type === 'error') CF.toast('⚠️ ' + data.message, 'error');
    } catch (e) {
      console.error('[CF receive error]', e);
    }
  },

  /* ──────────────────────────────────────────────────────
     2. STATE — project info in status strip & inspector
     ────────────────────────────────────────────────────── */
  _unit: 'm',
  _state: {
    project_id: '—',
    phase: 'new_construction',
    levels: 0,
    smart_objects: 0,
    connectors: 0,
    modules: 0,
  },

  _applyState(data) {
    Object.assign(CF._state, data.state || {});
    CF._renderStatus();
    CF._renderInspector();
    if (CF._state.levels_list) {
      CF._populateLevels(CF._state.levels_list);
    }
  },

  _populateLevels(levelsList) {
    if (!Array.isArray(levelsList)) return;
    document.querySelectorAll('.level-select').forEach(sel => {
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">-- เลือกระดับชั้น (Auto) --</option>';
      levelsList.forEach(lvl => {
        const opt = document.createElement('option');
        opt.value = lvl.id;
        const elev = lvl.elevation_m !== undefined ? ` (${lvl.elevation_m >= 0 ? '+' : ''}${lvl.elevation_m.toFixed(2)} ม.)` : '';
        opt.textContent = `${lvl.name || lvl.id}${elev}`;
        sel.appendChild(opt);
      });
      if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
        sel.value = currentVal;
      }
    });
  },

  _renderSelection(selected) {
    const emptyNotice = el('bim-empty-notice');
    const dataWrap = el('bim-data-wrap');
    if (!emptyNotice || !dataWrap) return;

    if (!selected) {
      emptyNotice.style.display = 'block';
      dataWrap.style.display = 'none';
      el('bim-type-badge').textContent = '📦 ชิ้นงาน BIM';
      el('bim-id-badge').textContent = '—';
      return;
    }

    emptyNotice.style.display = 'none';
    dataWrap.style.display = 'block';
    el('bim-type-badge').textContent = selected.badge || selected.type;
    el('bim-id-badge').textContent = '#' + selected.id;
    el('bim-name').textContent = selected.name || selected.type;

    const propsGrid = el('bim-props');
    propsGrid.innerHTML = '';
    if (selected.properties && typeof selected.properties === 'object') {
      for (const [key, val] of Object.entries(selected.properties)) {
        const cell = document.createElement('div');
        cell.className = 'bim-prop-cell';
        cell.innerHTML = `<span class="bim-prop-label">${key}</span><span class="bim-prop-val">${val}</span>`;
        propsGrid.appendChild(cell);
      }
    }

    const flipBtn = el('btn-flip-selected');
    if (flipBtn) {
      flipBtn.style.display = selected.type === 'architecture.wall' ? 'inline-flex' : 'none';
    }
  },

  _renderStatus() {
    const s = CF._state;
    const phaseLabel = { existing: 'ของเดิม', demolition: 'รื้อถอน', new_construction: 'ก่อสร้างใหม่' };
    el('status-project').textContent = s.project_id;
    el('status-phase').textContent = phaseLabel[s.phase] || s.phase;
    el('status-objects').textContent = s.smart_objects + ' obj';
  },

  _renderInspector() {
    const s = CF._state;
    setVal('info-project', s.project_id);
    setVal('info-phase', s.phase);
    setVal('info-levels', s.levels);
    setVal('info-objects', s.smart_objects);
    setVal('info-connectors', s.connectors);
    setVal('info-modules', s.modules);
  },

  /* ──────────────────────────────────────────────────────
     3. TOAST NOTIFICATIONS
     ────────────────────────────────────────────────────── */
  toast(message, type = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
    const container = el('toast-container');
    container.appendChild(div);

    setTimeout(() => {
      div.classList.add('hiding');
      setTimeout(() => div.remove(), 320);
    }, 3200);
  },

  /* ──────────────────────────────────────────────────────
     4. ACCORDION
     ────────────────────────────────────────────────────── */
  initAccordion() {
    document.querySelectorAll('.section-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.section');
        const isOpen = section.classList.contains('active');
        // Close all
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        // Toggle current
        if (!isOpen) section.classList.add('active');
      });
    });
    // Open first section by default
    const first = document.querySelector('.section');
    if (first) first.classList.add('active');
  },

  /* ──────────────────────────────────────────────────────
     5. PHASE PILLS
     ────────────────────────────────────────────────────── */
  initPhasePills() {
    document.querySelectorAll('.pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active-pill'));
        pill.classList.add('active-pill');
        CF._state.phase = pill.dataset.phase;
      });
    });
  },

  /* ──────────────────────────────────────────────────────
     6. ACTION HANDLERS — one per toolbar button
     ────────────────────────────────────────────────────── */
  actions: {
    // ── SETUP ──
    showInspector() {
      CF.send('show_inspector', {});
    },

    createLevel() {
      const name = gVal('level-name');
      const elev = toMm(parseFloat(gVal('level-elev') || '0'));
      const kind = gVal('level-kind');
      if (!name.trim()) { CF.toast('กรุณาระบุชื่อระดับชั้น', 'warn'); return; }
      CF.send('create_level', { name, elevation_mm: elev, kind });
      CF.toast(`สร้างระดับชั้น "${name}" (+${(elev/1000).toFixed(2)} m)`, 'success');
    },

    setPhase() {
      const phase = CF._state.phase;
      CF.send('set_phase', { phase });
      CF.toast('เปลี่ยนเฟสเป็น: ' + phase, 'success');
    },

    // ── STRUCTURE ──
    placeFoundation() {
      const type    = gVal('fnd-type');
      const w       = toMm(parseFloat(gVal('fnd-w') || '1.0'));
      const l       = toMm(parseFloat(gVal('fnd-l') || '1.0'));
      const d       = toMm(parseFloat(gVal('fnd-d') || '0.4'));
      CF.send('place_foundation', { foundation_type: type, size_mm: [w, l, d] });
      CF.toast('เลือกตำแหน่งในโมเดลเพื่อวางฐานราก 🏗', 'info');
    },

    placeColumn() {
      const w  = toMm(parseFloat(gVal('col-w')  || '0.2'));
      const d  = toMm(parseFloat(gVal('col-d')  || '0.2'));
      const h  = toMm(parseFloat(gVal('col-h')  || '2.8'));
      const bl = gVal('col-base-level');
      const tl = gVal('col-top-level');
      CF.send('place_column', { section_mm: [w, d], height_mm: h, base_level_id: bl, top_level_id: tl });
      CF.toast('คลิกในโมเดลเพื่อวางเสา 🏛', 'info');
    },

    // ── ARCHITECTURE ──
    drawWall() {
      const thick = toMm(parseFloat(gVal('wall-thick') || '0.1'));
      const ht    = toMm(parseFloat(gVal('wall-height') || '2.8'));
      const lvl   = gVal('wall-level');
      CF.send('draw_wall', { thickness_mm: thick, height_mm: ht, level_id: lvl });
      CF.toast('คลิกจุดเริ่มต้น → จุดสิ้นสุดเพื่อวาดผนัง', 'info');
    },

    cutOpening() {
      const w    = toMm(parseFloat(gVal('op-w')    || '0.9'));
      const h    = toMm(parseFloat(gVal('op-h')    || '2.05'));
      const sill = toMm(parseFloat(gVal('op-sill') || '0'));
      CF.send('cut_opening', { width_mm: w, height_mm: h, sill_mm: sill });
      CF.toast('คลิกที่ผนังเพื่อเจาะช่องเปิด', 'info');
    },

    placeDoorWindow() {
      const cat   = gVal('dw-cat');
      const op    = gVal('dw-op');
      const frame = gVal('dw-frame');
      const panel = gVal('dw-panel');
      CF.send('place_door_window', { category: cat, operation: op, frame_material: frame, panel_style: panel });
      CF.toast('คลิกที่ช่องเปิดเพื่อติดตั้ง', 'info');
    },

    createRoof() {
      const mat   = gVal('roof-mat');
      const slope = parseFloat(gVal('roof-slope') || '10');
      const sx    = parseFloat(gVal('roof-sx')    || '0');
      const sy    = parseFloat(gVal('roof-sy')    || '1');
      CF.send('create_roof', { covering_system: mat, slope_percent: slope, slope_direction_xy: [sx, sy] });
      CF.toast('เลือก Face ในโมเดลก่อนแล้วกด "สร้างหลังคา"', 'info');
    },

    addGutter() {
      const edge   = parseInt(gVal('gutter-edge') || '0');
      const outlet = parseFloat(gVal('gutter-outlet') || '1.0');
      CF.send('add_gutter', { edge_index: edge, outlet_ratio: outlet });
      CF.toast('เลือก Roof object แล้วกดอีกครั้ง', 'info');
    },

    // ── MEP ──
    placeManhole() {
      const size     = toMm(parseFloat(gVal('mh-size') || '0.6'));
      const coverLvl = gVal('mh-cover');
      const invIn    = gVal('mh-invin');
      const invOut   = gVal('mh-invout');
      CF.send('place_manhole', {
        size_mm: [size, size],
        cover_level_mm: coverLvl ? toMm(parseFloat(coverLvl)) : null,
        invert_in_mm:   invIn    ? toMm(parseFloat(invIn))    : null,
        invert_out_mm:  invOut   ? toMm(parseFloat(invOut))   : null,
      });
      CF.toast('คลิกในโมเดลเพื่อวางบ่อพัก', 'info');
    },

    routePipe() {
      const dia = toMm(parseFloat(gVal('pipe-dia') || '0.1'));
      const sys = gVal('pipe-sys');
      CF.send('route_pipe', { diameter_mm: dia, system: sys });
      CF.toast('วาดเส้นท่อในโมเดล (คลิกหลายจุด)', 'info');
    },

    placePanelboard() {
      const name   = gVal('pb-name');
      const phase  = gVal('pb-phase');
      const volt   = parseFloat(gVal('pb-volt')   || '230');
      const main_a = parseFloat(gVal('pb-main')   || '50');
      const bus_a  = parseFloat(gVal('pb-bus')    || '100');
      const ccts   = parseInt(gVal('pb-ccts')     || '24');
      CF.send('place_panelboard', {
        name, phase_config: phase,
        voltage_v: volt, main_breaker_a: main_a,
        bus_rating_a: bus_a, max_circuits: ccts
      });
      CF.toast(`สร้างตู้ไฟ ${name} เรียบร้อย`, 'success');
    },

    routeConduit() {
      const cz  = toMm(parseFloat(gVal('cond-cz')  || '2.6'));
      const stg = gVal('cond-stg');
      CF.send('route_conduit', { ceiling_z_mm: cz, strategy: stg });
      CF.toast('วาดเส้นท่อสายในโมเดล', 'info');
    },

    // ── INTERIOR ──
    applySurface() {
      const type = gVal('surf-type');
      CF.send('apply_surface', { surface_type: type });
      CF.toast('เลือก Face แล้วกด "ปูผิว"', 'info');
    },

    placeCabinet() {
      const w    = parseFloat(gVal('cab-w')    || '1800');
      const h    = parseFloat(gVal('cab-h')    || '850');
      const d    = parseFloat(gVal('cab-d')    || '600');
      const mods = parseInt(gVal('cab-mods')   || '3');
      const mat  = gVal('cab-mat');
      CF.send('place_cabinet', { width_mm: w, height_mm: h, depth_mm: d, module_count: mods, carcass_material_id: mat });
      CF.toast('คลิกในโมเดลเพื่อวางแนวเคาน์เตอร์', 'info');
    },

    placeWardrobe() {
      const w    = parseFloat(gVal('wd-w')  || '1800');
      const h    = parseFloat(gVal('wd-h')  || '2400');
      const d    = parseFloat(gVal('wd-d')  || '600');
      const door = gVal('wd-door');
      CF.send('place_wardrobe', { width_mm: w, height_mm: h, depth_mm: d, door_type: door });
      CF.toast('คลิกในโมเดลเพื่อวางตู้เสื้อผ้า', 'info');
    },

    // ── LIBRARY & COSTING ──
    placeAsset() {
      const id  = gVal('asset-id');
      const rot = parseFloat(gVal('asset-rot') || '0');
      if (!id.trim()) { CF.toast('กรุณาระบุ Asset ID', 'warn'); return; }
      CF.send('place_asset', { asset_id: id, rotation_deg: rot });
      CF.toast('คลิกในโมเดลเพื่อวางครุภัณฑ์', 'info');
    },

    showCosting() {
      CF.send('show_costing', {});
    },
  },

  /* ──────────────────────────────────────────────────────
     7. LIVE STATUS POLLING (every 8 sec)
     ────────────────────────────────────────────────────── */
  startPolling() {
    setInterval(() => {
      CF.send('get_state', {});
    }, 8000);
    // Initial pull
    setTimeout(() => CF.send('get_state', {}), 600);
  },

  /* ──────────────────────────────────────────────────────
     8. INIT
     ────────────────────────────────────────────────────── */
  initCategoryTabs() {
    document.querySelectorAll('.cat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const cat = tab.dataset.cat;
        document.querySelectorAll('.section').forEach(s => {
          if (cat === 'all') {
            s.style.display = '';
          } else if (s.id === cat) {
            s.style.display = '';
            s.classList.add('active');
          } else {
            s.style.display = 'none';
          }
        });
      });
    });
  },

  initSearch() {
    const searchInput = el('tool-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.tool-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        if (!q || text.includes(q)) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
      if (q) {
        document.querySelectorAll('.section').forEach(s => {
          s.style.display = '';
          s.classList.add('active');
        });
      }
    });
  },

  initBimActions() {
    el('btn-zoom-selected')?.addEventListener('click', () => {
      CF.send('zoom_selected', {});
    });
    el('btn-flip-selected')?.addEventListener('click', () => {
      CF.send('flip_selected_wall', {});
    });
    el('btn-delete-selected')?.addEventListener('click', () => {
      CF.send('delete_selected', {});
    });
  },

  initShortcuts() {
    let keyBuf = '';
    let lastKeyTime = 0;

    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'select' || activeTag === 'textarea') {
        if (e.target && e.target.id === 'tool-search' && e.key === 'Enter') {
          const q = e.target.value.trim().toUpperCase();
          if (q) {
            CF.send('trigger_shortcut', { code: q });
            e.preventDefault();
          }
        }
        return;
      }

      const key = e.key;
      if (/^[a-zA-Z]$/.test(key)) {
        const now = Date.now();
        if (now - lastKeyTime > 1000) {
          keyBuf = '';
        }
        lastKeyTime = now;
        keyBuf += key.toUpperCase();

        const known = ['WA', 'WALL', 'CL', 'CO', 'COL', 'BM', 'BEAM', 'DR', 'DOOR', 'WN', 'WIN', 'OP', 'OPN', 'FL', 'CE', 'FD', 'GR', 'CN', 'PI', 'MH', 'CB', 'WR', 'CF', 'IN'];
        if (known.includes(keyBuf)) {
          CF.send('trigger_shortcut', { code: keyBuf });
          keyBuf = '';
        }
      }
    });
  },

  initUnitToggle() {
    const btnM = el('unit-btn-m');
    const btnMm = el('unit-btn-mm');
    if (!btnM || !btnMm) return;

    const idsToConvert = [
      'level-elev', 'fnd-w', 'fnd-l', 'fnd-d',
      'col-w', 'col-d', 'col-h', 'wall-thick', 'wall-height',
      'op-w', 'op-h', 'op-sill', 'mh-size', 'mh-cover',
      'mh-invin', 'mh-invout', 'pipe-dia', 'cond-cz',
      'cab-w', 'cab-h', 'cab-d', 'ward-w', 'ward-h', 'ward-d'
    ];

    const setUnit = (newUnit) => {
      if (CF._unit === newUnit) return;
      const oldUnit = CF._unit;
      CF._unit = newUnit;

      btnM.classList.toggle('active', newUnit === 'm');
      btnMm.classList.toggle('active', newUnit === 'mm');

      // Convert all input values
      idsToConvert.forEach(id => {
        const input = el(id);
        if (!input || input.value === '') return;
        const val = parseFloat(input.value);
        if (isNaN(val)) return;

        if (newUnit === 'm') {
          input.value = (val / 1000.0).toFixed(val % 1000 === 0 ? 2 : (val < 100 ? 3 : 2));
          input.step = '0.05';
        } else {
          input.value = Math.round(val * 1000.0);
          input.step = '10';
        }
      });

      // Update unit labels
      document.querySelectorAll('.unit-lbl').forEach(lbl => {
        if (newUnit === 'm') {
          lbl.textContent = lbl.textContent.replace('(มม.)', '(ม.)').replace('(mm)', '(ม.)');
        } else {
          lbl.textContent = lbl.textContent.replace('(ม.)', '(มม.)').replace('(m)', '(มม.)');
        }
      });

      CF.toast(`สลับหน่วยวัดเป็น: ${newUnit === 'm' ? 'เมตร (Meters)' : 'มิลลิเมตร (Millimeters)'}`, 'info');
    };

    btnM.addEventListener('click', () => setUnit('m'));
    btnMm.addEventListener('click', () => setUnit('mm'));
  },

  initTooltips() {
    const tip = el('cf-tooltip');
    if (!tip) return;

    document.querySelectorAll('[data-tip-title]').forEach(elem => {
      elem.addEventListener('mouseenter', (e) => {
        const title = elem.getAttribute('data-tip-title') || '';
        const sc = elem.getAttribute('data-tip-sc') || '';
        const desc = elem.getAttribute('data-tip-desc') || '';
        const mouse = elem.getAttribute('data-tip-mouse') || '';
        const keys = elem.getAttribute('data-tip-keys') || '';

        let html = `<div class="cf-tooltip-title"><span>${title}</span>${sc ? `<span class="shortcut-badge">${sc}</span>` : ''}</div>`;
        if (desc) html += `<div class="cf-tooltip-desc">${desc}</div>`;
        if (mouse) html += `<div class="cf-tooltip-row"><span>🖱️</span><span>${mouse}</span></div>`;
        if (keys) html += `<div class="cf-tooltip-row"><span>⌨️</span><span>${keys}</span></div>`;

        tip.innerHTML = html;
        tip.style.display = 'block';
        positionTooltip(e);
      });

      elem.addEventListener('mousemove', positionTooltip);

      elem.addEventListener('mouseleave', () => {
        tip.style.display = 'none';
      });
    });

    function positionTooltip(e) {
      if (tip.style.display === 'none') return;
      const x = e.clientX + 12;
      const y = e.clientY + 12;
      const rect = tip.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 10;
      const maxY = window.innerHeight - rect.height - 10;

      tip.style.left = Math.min(x, Math.max(10, maxX)) + 'px';
      tip.style.top = Math.min(y, Math.max(10, maxY)) + 'px';
    }
  },

  initHelpModal() {
    const modal = el('help-modal');
    const openBtn = el('btn-help-modal');
    const closeBtn = el('btn-close-help');
    if (!modal) return;

    const toggleModal = (show) => {
      modal.style.display = show ? 'flex' : 'none';
    };

    openBtn?.addEventListener('click', () => toggleModal(true));
    closeBtn?.addEventListener('click', () => toggleModal(false));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) toggleModal(false);
    });

    // Tab switching inside modal
    modal.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        modal.querySelectorAll('.modal-tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const targetId = `tab-${tab.dataset.tab}`;
        el(targetId)?.classList.add('active');
      });
    });

    // '?' key toggles help modal
    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'select' || activeTag === 'textarea') return;
      if (e.key === '?' || e.key === 'F1') {
        toggleModal(modal.style.display === 'none');
        e.preventDefault();
      } else if (e.key === 'Escape' && modal.style.display !== 'none') {
        toggleModal(false);
        e.preventDefault();
      }
    });
  },
  init() {
    CF.initAccordion();
    CF.initPhasePills();
    CF.initCategoryTabs();
    CF.initSearch();
    CF.initBimActions();
    CF.initShortcuts();
    CF.initTooltips();
    CF.initHelpModal();
    CF.initUnitToggle();
    CF.startPolling();
    CF._renderStatus();

    // Wire all action buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (typeof CF.actions[action] === 'function') {
          CF.actions[action]();
        } else {
          CF.toast(`ยังไม่ implement: ${action}`, 'warn');
        }
      });
    });
  },
};

/* ── Helpers ──────────────────────────────────────────────── */
function toMm(val) {
  if (isNaN(val)) return 0;
  return CF._unit === 'm' ? val * 1000.0 : val;
}
function fromMm(val) {
  if (isNaN(val)) return 0;
  return CF._unit === 'm' ? val / 1000.0 : val;
}
function el(id)      { return document.getElementById(id); }
function gVal(id)    { const e = el(id); return e ? e.value : ''; }
function setVal(id, v) {
  const e = el(id);
  if (!e) return;
  if (e.tagName === 'SPAN' || e.tagName === 'DIV') e.textContent = v;
  else e.value = v;
}

/* ── Bootstrap ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => CF.init());
