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
      if (data.type === 'selection') {
        CF._renderSelection(data.selected);
        if (data.takeoff_hud) CF.renderTakeoffHUD(data.takeoff_hud);
      }
      if (data.type === 'toast') CF.toast(data.message, data.level || 'info');
      if (data.type === 'error') CF.toast('⚠️ ' + data.message, 'error');
      if (data.type === 'door_window_catalog') {
        CF._dwCatalog = Array.isArray(data.items) ? data.items : [];
        CF.renderDoorWindowGallery();
      }
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

  switchToTab(mode) {
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.workspace-pane').forEach(p => p.classList.remove('active'));
    const tab = document.querySelector(`.mode-tab[data-mode="${mode}"]`);
    const pane = el(`pane-${mode}`);
    if (tab) tab.classList.add('active');
    if (pane) pane.classList.add('active');
  },

  initMainModeTabs() {
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        CF.switchToTab(mode);
      });
    });
  },

  renderTakeoffHUD(hud) {
    if (!hud) return;
    const badge = el('hud-scope-badge');
    if (badge) {
      badge.textContent = hud.is_all_model ? 'ทั้งโครงการ' : `เลือกไว้ ${hud.selection_count} ชิ้น`;
    }
    setVal('hud-concrete', hud.concrete_m3 !== undefined ? hud.concrete_m3.toFixed(2) : '0.00');
    setVal('hud-formwork', hud.formwork_m2 !== undefined ? hud.formwork_m2.toFixed(2) : '0.00');
    setVal('hud-wall', hud.wall_net_m2 !== undefined ? hud.wall_net_m2.toFixed(2) : '0.00');
    setVal('hud-tile', hud.tile_floor_m2 !== undefined ? hud.tile_floor_m2.toFixed(2) : '0.00');
    setVal('hud-skirting', hud.skirting_m !== undefined ? hud.skirting_m.toFixed(2) : '0.00');
    setVal('hud-paint', hud.paint_m2 !== undefined ? hud.paint_m2.toFixed(2) : '0.00');
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
      const dot = el('inspector-indicator');
      if (dot) dot.style.display = 'none';
      return;
    }

    emptyNotice.style.display = 'none';
    dataWrap.style.display = 'block';
    el('bim-type-badge').textContent = selected.badge || selected.type;
    el('bim-id-badge').textContent = '#' + selected.id;
    el('bim-name').textContent = selected.name || selected.type;
    const dot = el('inspector-indicator');
    if (dot) dot.style.display = 'inline-block';

    const propsGrid = el('bim-props');
    propsGrid.innerHTML = '';
    if (selected.properties && typeof selected.properties === 'object') {
      for (const [key, val] of Object.entries(selected.properties)) {
        const cell = document.createElement('div');
        cell.className = 'bim-prop-cell';
        
        const isEditable = key.includes('(W)') || key.includes('(L)') || key.includes('(H)') || key.includes('ความสูง') || key.includes('ความหนา') || key.includes('ความกว้าง') || key.includes('ความยาว');
        
        if (isEditable) {
           const rawVal = String(val).replace(/[^0-9.]/g, '');
           cell.innerHTML = `<span class="bim-prop-label">${key}</span>
                             <input type="number" step="0.01" class="bim-prop-input" data-key="${key}" data-id="${selected.id}" value="${rawVal}" style="width: 60px; text-align: right; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; padding: 2px 4px; font-family: 'Sarabun', sans-serif;">
                             <span class="bim-prop-unit" style="margin-left: 4px; color: #aaa;">m</span>`;
           
           const input = cell.querySelector('input');
           input.addEventListener('change', (e) => {
              const newVal = e.target.value;
              if (typeof sketchup !== 'undefined') {
                 sketchup.dispatch(JSON.stringify({
                    action: 'update_property',
                    params: {
                      entity_id: selected.id,
                      property: key,
                      value: newVal
                    }
                 }));
              }
           });
        } else {
           cell.innerHTML = `<span class="bim-prop-label">${key}</span><span class="bim-prop-val">${val}</span>`;
        }
        
        propsGrid.appendChild(cell);
      }
    }

    const flipBtn = el('btn-flip-selected');
    if (flipBtn) {
      flipBtn.style.display = selected.type === 'architecture.wall' ? 'inline-flex' : 'none';
    }

    const wallEditor = el('bim-wall-editor');
    if (wallEditor) {
      if (selected && selected.type === 'architecture.wall') {
        wallEditor.style.display = 'block';
        if (selected.properties) {
          for (const [k, v] of Object.entries(selected.properties)) {
            const kl = k.toLowerCase();
            const num = parseFloat(v);
            if (!isNaN(num)) {
              if (kl.includes('หนา') || kl.includes('thick')) {
                const mVal = num > 5 ? num / 1000.0 : num;
                const thickInput = el('bim-wall-thick');
                if (thickInput) thickInput.value = mVal.toFixed(2);
              } else if (kl.includes('สูง') || kl.includes('height')) {
                const mVal = num > 50 ? num / 1000.0 : num;
                const hInput = el('bim-wall-h');
                if (hInput) hInput.value = mVal.toFixed(2);
              }
            }
          }
        }
      } else {
        wallEditor.style.display = 'none';
      }
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

    useLaserLevel() {
      CF.send('use_laser_level', {});
      CF.toast('เปิดเลเซอร์วัดระดับ [LS] 🔴 คลิกจุดอ้างอิง Benchmark', 'info');
    },

    placeColumn() {
      const preset = gVal('col-preset') || 'RC-C-0.20x0.20';
      const w  = toMm(parseFloat(gVal('col-w')  || '0.2'));
      const d  = toMm(parseFloat(gVal('col-d')  || '0.2'));
      const h  = toMm(parseFloat(gVal('col-h')  || '2.8'));
      const bl = gVal('col-base-level');
      const tl = gVal('col-top-level');
      const anchor = gVal('col-anchor') || 'center';
      CF.send('place_column', { section_mm: [w, d], height_mm: h, base_level_id: bl, top_level_id: tl, anchor: anchor, profile_code: preset });
      CF.toast('คลิกในโมเดลเพื่อวางเสา [CL] 🏛', 'info');
    },

    drawBeam() {
      const preset = gVal('bm-preset') || 'RC-B-0.20x0.40';
      const w  = toMm(parseFloat(gVal('bm-w') || '0.2'));
      const d  = toMm(parseFloat(gVal('bm-d') || '0.4'));
      const lvl = gVal('bm-level') || '';
      const anchor = gVal('bm-anchor') || 'top_center';
      CF.send('draw_beam', { section_mm: [w, d], level_id: lvl, anchor: anchor, profile_code: preset });
      CF.toast('คลิกในโมเดลเพื่อเริ่มวาดแนวคาน [BM] 🏗', 'info');
    },

    generateFloorPaving() {
      this.generatePaving();
    },

    smartStretch() {
      const wStr = prompt("ความกว้างเป้าหมาย (เมตร m เช่น 1.20) หรือเว้นว่างหากไม่ต้องการเปลี่ยน:", "");
      const hStr = prompt("ความสูงเป้าหมาย (เมตร m เช่น 2.20) หรือเว้นว่างหากไม่ต้องการเปลี่ยน:", "");
      const marginStr = prompt("ขนาดขอบเฟรมที่ไม่ให้เพี้ยน (เมตร m เช่น 0.05 หรือ 5 ซม.):", "0.05");

      const w = wStr ? parseFloat(wStr) : null;
      const h = hStr ? parseFloat(hStr) : null;
      const margin = marginStr ? parseFloat(marginStr) : 0.05;

      if (!w && !h) {
        CF.toast('ยกเลิก: ไม่ได้ระบุขนาดที่ต้องการยืด', 'warn');
        return;
      }

      CF.send('smart_stretch', {
        target_width_m: w,
        target_height_m: h,
        frame_margin_m: margin
      });
      CF.toast('กำลังยืดขยายขนาดวัตถุโดยรักษาขอบเฟรม ↔️', 'info');
    },

    drawRevitAutoRoof() {
      const form = prompt("เลือกรูปแบบหลังคา Auto แบบ Revit (Revit Roof by Footprint):\n1 = hip (ปั้นหยา)\n2 = gable (จั่ว + ปิดผนังหน้าจั่วอัตโนมัติ)\n3 = shed (เพิงแหงน)\n4 = flat (ดาดฟ้า)", "hip");
      if (!form) return;
      let formName = "hip";
      if (form === "2" || form.toLowerCase() === "gable") formName = "gable";
      else if (form === "3" || form.toLowerCase() === "shed" || form.toLowerCase() === "lean_to") formName = "shed";
      else if (form === "4" || form.toLowerCase() === "flat") formName = "flat";

      const slope = parseFloat(prompt("องศาความชันหลังคา (Slope องศา deg):", "30") || "30");
      const overhang = parseFloat(prompt("ระยะยื่นชายคา (เมตร m เช่น 0.80):", "0.80") || "0.80");
      const thick = parseFloat(prompt("ความหนาแผ่นมุง/โครงสร้าง (เมตร m เช่น 0.15):", "0.15") || "0.15");
      const fasciaH = parseFloat(prompt("ความสูงไม้เชิงชาย (เมตร m เช่น 0.20):", "0.20") || "0.20");
      const attach = confirm("ต้องการแนบหัวผนังติดใต้หลังคาและปิดหน้าจั่วอัตโนมัติ (Attach Walls to Roof แบบ Revit) หรือไม่?");

      CF.send('revit_auto_roof', {
        form: formName,
        slope_deg: slope,
        overhang_m: overhang,
        thickness_m: thick,
        fascia_height_m: fasciaH,
        attach_walls: attach
      });
      CF.toast('กำลังประมวลผลสร้างหลังคา Auto แบบ Revit 🏠', 'info');
    },

    generateHipGableRoof() {
      const form = prompt("เลือกรูปแบบหลังคา:\n1 = hip (ปั้นหยา)\n2 = gable (จั่ว)\n3 = lean_to (เพิงแหงน)", "hip");
      if (!form) return;
      let formName = "hip";
      if (form === "2" || form.toLowerCase() === "gable") formName = "gable";
      else if (form === "3" || form.toLowerCase() === "lean_to") formName = "lean_to";

      const slope = parseFloat(prompt("ความลาดชันหลังคา (องศา Deg):", "30") || "30");
      const overhang = parseFloat(prompt("ระยะยื่นชายคา (เมตร m เช่น 0.80):", "0.80") || "0.80");
      const fasciaH = parseFloat(prompt("ความสูงไม้เชิงชาย (เมตร m เช่น 0.20):", "0.20") || "0.20");
      const thick = parseFloat(prompt("ความหนาแผ่นมุง (เมตร m เช่น 0.035):", "0.035") || "0.035");

      CF.send('generate_hip_gable_roof', {
        form: formName,
        slope_deg: slope,
        overhang_m: overhang,
        fascia_height_m: fasciaH,
        thickness_m: thick
      });
      CF.toast('เลือก Face หรืออาคาร แล้วกำลังสร้างหลังคา 🏠', 'info');
    },

    saveCustomProfile() {
      CF.send('save_custom_profile', {});
      CF.toast('เลือก Face หน้าตัด แล้วกดบันทึกโปรไฟล์ [NP] 📐', 'info');
    },

    sweepOnSelection() {
      const code = gVal('sweep-profile') || 'SKIRT-100x15';
      CF.send('sweep_on_selection', { profile_code: code });
      CF.toast('กำลังกวาดโปรไฟล์ตามแนวเส้นที่เลือก [PS] ➰', 'info');
    },

        drawProfileSweep() {
      const code   = gVal('sweep-profile') || 'SKIRT-100x15';
      const anchor = gVal('sweep-anchor') || 'bottom_left';
      const mat    = gVal('sweep-mat') || 'wood';
      CF.send('draw_profile_sweep', { profile_code: code, anchor: anchor, material: mat });
      CF.toast('คลิกลากเส้นแนวบัวสถาปัตย์ [PF] ➰ ดับเบิ้ลคลิกเพื่อจบงาน', 'info');
    },

    generatePaving() {
      const pat   = gVal('pave-pattern') || 'running_bond_half';
      const w     = parseFloat(gVal('pave-w') || '0.6');
      const l     = parseFloat(gVal('pave-l') || '0.6');
      const joint = parseFloat(gVal('pave-joint') || '0.002');
      CF.send('generate_paving', { pattern: pat, width_m: w, length_m: l, joint_m: joint });
      CF.toast('สร้างลวดลายกระเบื้อง 3D บน Face สำเร็จ 🟫', 'success');
    },

    arrayOnFace() {
      const elem    = gVal('clad-type') || 'metal_sheet_roof';
      const spacing = parseFloat(gVal('clad-spacing') || '0.76');
      const ovh     = parseFloat(gVal('clad-overhang') || '0.10');
      CF.send('array_on_face', { element_type: elem, spacing_m: spacing, overhang_m: ovh });
      CF.toast('วางชิ้นงานกระจายตัวบนผิวเรียบร้อย 📐', 'success');
    },

    detectRooms() {
      CF.send('detect_rooms', {});
      CF.toast('กำลังตรวจหาห้องอัตโนมัติจากแนวผนัง [RM] 🚪', 'info');
    },

    assignRebar() {
      CF.send('assign_rebar', {});
      CF.toast('เลือกเสา คาน หรือฐานราก เพื่อใส่เหล็กเสริม 3D [RB] 🏗️', 'info');
    },

    showBbs() {
      CF.send('show_bbs', {});
      CF.toast('เปิดตารางดัดเหล็ก Bar Bending Schedule [BBS] 📋', 'info');
    },

    stretchByArea() {
      CF.send('stretch_by_area', {});
      CF.toast('เลือก Face เพื่อยืด/ปรับขนาดตามพื้นที่เป้าหมาย [SA] 📏', 'info');
    },

    generateExtensionScenes() {
      CF.send('generate_extension_scenes', {});
      CF.toast('กำลังสร้าง 5 Scenes แปลน-รูปด้าน-รูปตัด สำหรับ LayOut 📑', 'info');
    },

    autoDimension() {
      CF.send('auto_dimension', {});
      CF.toast('กำลังดึงเส้นบอกระยะอัตโนมัติ (Auto-Dimension) 📏', 'info');
    },

    activateSpotElevation() {
      CF.send('activate_spot_elevation', {});
      CF.toast('เลือกเครื่องมือปักหมุดระดับแล้ว คลิกบนพื้นผิว 🎯', 'info');
    },

    exportBoqCsv() {
      CF.send('export_boq_csv', {});
      CF.toast('กำลังส่งออกไฟล์ BOQ เป็น CSV 📊', 'success');
    },

        drawCurtainWall() {
      CF.send('draw_curtain_wall', {});
      CF.toast('คลิกเลือก Face เพื่อสร้างผนังกระจก / ระแนงบังแดด [CW] 🪟', 'info');
    },

    modifyCurtainWall() {
      CF.send('modify_curtain_wall', {});
      CF.toast('เลือกผนังกระจกหรือระแนงเพื่อแก้ไขพารามิเตอร์ [MCW] 📐', 'info');
    },

        drawGridFraming() {
      CF.send('draw_grid_framing', {});
      CF.toast('คลิกตำแหน่งเริ่มวางระบบกริดเสา-คานอัตโนมัติ [GF] 📐', 'info');
    },

    drawStair() {
      CF.send('draw_stair', {});
      CF.toast('คลิกจุดเริ่มและทิศทางเพื่อสร้างบันได 3D [ST] 🪜', 'info');
    },

    drawRoofFraming() {
      CF.send('draw_roof_framing', {});
      CF.toast('คลิกเลือก Face ผิวหลังคาเพื่อสร้างโครงสร้างเหล็ก [RF] 🏠', 'info');
    },

    modifyRoofFraming() {
      CF.send('modify_roof_framing', {});
      CF.toast('เลือกโครงเหล็กหลังคาเพื่อแก้ไขพารามิเตอร์ [MRF] 🛠', 'info');
    },

        drawGrid() {
      const name = gVal('gr-name') || 'Grid';
      const lvl = gVal('gr-level') || '';
      CF.send('draw_grid', { name: name, level_id: lvl });
      CF.toast(`คลิกในโมเดลเพื่อลากเส้นกริด "${name}" [GR] 📐`, 'info');
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
      const payload = { category: cat, operation: op, frame_material: frame, panel_style: panel };
      const sel = CF._dwSelection;
      if (sel) {
        payload.type_id = sel.id;
        payload.type_name = sel.name;
        payload.width_mm = sel.width_mm;
        payload.height_mm = sel.height_mm;
      }
      const depth   = parseFloat(gVal('dw-depth') || '0');
      const leaf    = parseFloat(gVal('dw-leaf') || '0');
      const mullion = parseFloat(gVal('dw-mullion') || '0');
      const louver  = parseFloat(gVal('dw-louver') || '0');
      if (depth > 0) payload.frame_depth_mm = depth;
      if (leaf > 0) payload.leaf_thickness_mm = leaf;
      if (mullion > 0) payload.mullion_width_mm = mullion;
      if (louver > 0) payload.louver_spacing_mm = louver;
      CF.send('place_door_window', payload);
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

    drawFloor() {
      const thick = toMm(parseFloat(gVal('fl-thick') || '0.1'));
      const lvl = gVal('fl-level') || '';
      CF.send('draw_floor', { thickness_mm: thick, level_id: lvl });
      CF.toast('คลิกกำหนดจุดขอบเขตพื้น [FL] 🟦', 'info');
    },

    drawCeiling() {
      const h = toMm(parseFloat(gVal('ce-h') || '2.6'));
      const thick = toMm(parseFloat(gVal('ce-thick') || '0.012'));
      const lvl = gVal('ce-level') || '';
      CF.send('draw_ceiling', { height_mm: h, thickness_mm: thick, level_id: lvl });
      CF.toast('คลิกกำหนดแนวฝ้าเพดาน [CE] ☁️', 'info');
    },

    applyWallChanges() {
      const thick = toMm(parseFloat(el('bim-wall-thick')?.value || '0.1'));
      const h = toMm(parseFloat(el('bim-wall-h')?.value || '2.8'));
      CF.send('update_selected_wall', { thickness_mm: thick, height_mm: h });
    },

    editWallPath() {
      CF.send('edit_selected_wall', {});
      CF.toast('เข้าสู่โหมดดัดแนวผนังใน Viewport [WallEditTool] ✏️', 'info');
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
      // Also filter ribbon buttons and blocks in real-time
      document.querySelectorAll('.ribbon-group-block').forEach(block => {
        let hasMatch = false;
        block.querySelectorAll('.ribbon-btn').forEach(btn => {
          const btnText = (btn.textContent + ' ' + (btn.title || '') + ' ' + (btn.dataset.toolName || '')).toLowerCase();
          if (!q || btnText.includes(q)) {
            btn.style.display = '';
            hasMatch = true;
          } else {
            btn.style.display = 'none';
          }
        });
        if (!q) {
          const activeTab = document.querySelector('.ribbon-tab.active')?.dataset.tab || 'all';
          if (activeTab === 'all' || block.dataset.category === activeTab) {
            block.classList.remove('hidden');
          } else {
            block.classList.add('hidden');
          }
        } else {
          if (hasMatch) {
            block.classList.remove('hidden');
          } else {
            block.classList.add('hidden');
          }
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
    el('btn-apply-wall')?.addEventListener('click', () => {
      CF.actions.applyWallChanges();
    });
    el('btn-edit-wall-path')?.addEventListener('click', () => {
      CF.actions.editWallPath();
    });

    // BOQ Modal wiring
    el('btn-close-boq')?.addEventListener('click', () => CF.closeBOQModal());
    el('btn-close-boq-foot')?.addEventListener('click', () => CF.closeBOQModal());
    el('btn-export-boq-csv')?.addEventListener('click', () => CF.exportBOQToCSV());
    el('btn-boq')?.addEventListener('click', () => {
      CF.send('show_costing', {});
    });
  },

  openBOQModal() {
    const modal = el('boq-modal');
    if (modal) modal.style.display = 'flex';
  },

  closeBOQModal() {
    const modal = el('boq-modal');
    if (modal) modal.style.display = 'none';
  },

  renderBOQ(boqData) {
    if (!boqData) return;
    window._lastBOQData = boqData;
    const gTotal = el('boq-grand-total');
    if (gTotal) {
      gTotal.textContent = '฿' + (boqData.grand_total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    const strCat = (boqData.categories || []).find(c => c.name.includes('Structure') || c.name.includes('โครงสร้าง'));
    const arcCat = (boqData.categories || []).find(c => c.name.includes('Architecture') || c.name.includes('สถาปัตยกรรม'));
    const mepCat = (boqData.categories || []).find(c => c.name.includes('MEP') || c.name.includes('สุขาภิบาล'));

    if (strCat && el('boq-str-total')) el('boq-str-total').textContent = '฿' + (strCat.subtotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (arcCat && el('boq-arc-total')) el('boq-arc-total').textContent = '฿' + (arcCat.subtotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (mepCat && el('boq-mep-total')) el('boq-mep-total').textContent = '฿' + (mepCat.subtotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const tbody = el('boq-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      (boqData.categories || []).forEach(cat => {
        const catRow = document.createElement('tr');
        catRow.className = 'boq-cat-row';
        catRow.innerHTML = `
          <td colspan="6" style="font-weight: 700; background: rgba(56, 189, 248, 0.12); color: #38bdf8; padding: 8px 12px;">${cat.name}</td>
          <td style="font-weight: 700; background: rgba(56, 189, 248, 0.12); text-align: right; color: #38bdf8; padding: 8px 12px; font-family: monospace;">฿${(cat.subtotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        tbody.appendChild(catRow);

        (cat.items || []).forEach(item => {
          const row = document.createElement('tr');
          row.className = 'boq-item-row';
          row.innerHTML = `
            <td style="font-family: monospace; font-size: 11px; color: #94a3b8;">${item.code}</td>
            <td style="font-weight: 500;">${item.name}</td>
            <td style="text-align: right; font-family: monospace;">${item.qty.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: center; color: #94a3b8;">${item.unit}</td>
            <td style="text-align: right; font-family: monospace;">${item.mat_rate.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: right; font-family: monospace;">${item.lab_rate.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: right; font-weight: 600; font-family: monospace; color: #f8fafc;">฿${item.total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          `;
          tbody.appendChild(row);
        });
      });
    }
  },

  exportBOQToCSV() {
    const data = window._lastBOQData;
    if (!data || !data.categories) {
      CF.toast('ไม่พบข้อมูล BOQ สำหรับส่งออก', 'warn');
      return;
    }
    let csvContent = "\uFEFF";
    csvContent += "รหัส,หมวดหมู่,รายการงาน,ปริมาณ,หน่วย,ค่าวัสดุต่อหน่วย(บาท),ค่าแรงต่อหน่วย(บาท),รวมเงิน(บาท)\n";

    data.categories.forEach(cat => {
      (cat.items || []).forEach(item => {
        const row = [
          `"${item.code}"`,
          `"${cat.name}"`,
          `"${item.name}"`,
          item.qty,
          `"${item.unit}"`,
          item.mat_rate,
          item.lab_rate,
          item.total
        ];
        csvContent += row.join(",") + "\n";
      });
    });

    csvContent += `\n"","","ราคารวมทั้งโครงการ (Grand Total)","","","","",${data.grand_total}\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ConstructFlow_BOQ_${data.project_id || 'Project'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    CF.toast('📥 ส่งออกไฟล์ BOQ CSV สำเร็จ (พร้อมเปิดใน Excel)', 'success');
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

  initAnchorMatrix() {
    document.querySelectorAll('.anchor-grid-3x3').forEach(grid => {
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.anchor-btn');
        if (!btn) return;
        const targetId = grid.dataset.target;
        const anchorVal = btn.dataset.anchor;
        grid.querySelectorAll('.anchor-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const hiddenInput = document.getElementById(targetId);
        if (hiddenInput) hiddenInput.value = anchorVal;
        const lbl = document.getElementById(targetId + '-lbl');
        if (lbl && btn.title) lbl.textContent = btn.title.split(':')[0] || btn.title;
      });
    });
  },

  initPresets() {
    const colPreset = document.getElementById('col-preset');
    if (colPreset) {
      colPreset.addEventListener('change', () => {
        const opt = colPreset.selectedOptions[0];
        if (opt && opt.dataset.w) {
          const wInput = document.getElementById('col-w');
          const dInput = document.getElementById('col-d');
          if (wInput) wInput.value = opt.dataset.w;
          if (dInput) dInput.value = opt.dataset.d;
        }
      });
    }

    const bmPreset = document.getElementById('bm-preset');
    if (bmPreset) {
      bmPreset.addEventListener('change', () => {
        const opt = bmPreset.selectedOptions[0];
        if (opt && opt.dataset.w) {
          const wInput = document.getElementById('bm-w');
          const dInput = document.getElementById('bm-d');
          if (wInput) wInput.value = opt.dataset.w;
          if (dInput) dInput.value = opt.dataset.d;
        }
      });
    }

    const sweepProfile = document.getElementById('sweep-profile');
    if (sweepProfile) {
      sweepProfile.addEventListener('change', () => {
        const opt = sweepProfile.selectedOptions[0];
        if (opt && opt.dataset.anchor) {
          const anchor = opt.dataset.anchor;
          const hidden = document.getElementById('sweep-anchor');
          if (hidden) hidden.value = anchor;
          const grid = document.getElementById('sweep-anchor-grid');
          if (grid) {
            grid.querySelectorAll('.anchor-btn').forEach(b => {
              if (b.dataset.anchor === anchor) {
                b.classList.add('active');
                const lbl = document.getElementById('sweep-anchor-lbl');
                if (lbl && b.title) lbl.textContent = b.title.split(':')[0] || b.title;
              } else {
                b.classList.remove('active');
              }
            });
          }
        }
      });
    }
  },



  /* ── DOOR/WINDOW CATALOG GALLERY ───────────────────────── */
  _dwCatalog: [],
  _dwSelection: null,
  _dwCatFilter: 'all',

  initDoorWindowGallery() {
    const search = el('dw-gallery-search');
    if (search) {
      search.addEventListener('input', () => CF.renderDoorWindowGallery());
    }
    document.querySelectorAll('.dw-cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.dw-cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        CF._dwCatFilter = chip.dataset.cat || 'all';
        CF.renderDoorWindowGallery();
      });
    });
  },

  _dwMatchesFilter(item) {
    const cat = CF._dwCatFilter;
    if (cat === 'all') return true;
    if (cat === 'door') return item.category === 'door';
    if (cat === 'window') return item.category === 'window';
    if (cat === 'sliding') return item.operation === 'sliding';
    if (cat === 'swing') return ['swing', 'swing_double', 'swing_double_ego', 'casement'].includes(item.operation);
    if (cat === 'special') return ['louver', 'shutter', 'pivot', 'awning', 'hopper'].includes(item.operation);
    if (cat === 'storefront') return String(item.id).startsWith('SF');
    return true;
  },

  renderDoorWindowGallery() {
    const grid = el('dw-gallery-grid');
    if (!grid) return;
    const term = (gVal('dw-gallery-search') || '').trim().toLowerCase();
    const items = CF._dwCatalog.filter(item => {
      if (!CF._dwMatchesFilter(item)) return false;
      if (!term) return true;
      const hay = [item.id, item.name, item.operation, item.panel_style,
        `${item.width_mm}x${item.height_mm}`,
        `${(item.width_mm / 1000).toFixed(1)}x${(item.height_mm / 1000).toFixed(1)}`].join(' ').toLowerCase();
      return hay.includes(term);
    });

    const count = el('dw-gallery-count');
    if (count) count.textContent = items.length;

    if (!items.length) {
      grid.innerHTML = '<div class="dw-gallery-empty">ไม่พบแบบที่ค้นหา</div>';
      return;
    }

    grid.innerHTML = items.map(item => `
      <div class="dw-card${CF._dwSelection && CF._dwSelection.id === item.id ? ' selected' : ''}" data-dw-id="${item.id}" title="${item.name} — ${item.width_mm}x${item.height_mm} มม. (${item.operation})">
        ${CF.dwSymbolSvg(item)}
        <div class="dw-card-name">${item.name}</div>
        <div class="dw-card-size">${item.width_mm} × ${item.height_mm} มม.</div>
      </div>`).join('');

    grid.querySelectorAll('.dw-card').forEach(card => {
      card.addEventListener('click', () => CF.selectDoorWindowCatalog(card.dataset.dwId));
    });
  },

  dwSymbolSvg(item) {
    const S = 'stroke="#fb923c" stroke-width="3" fill="none" stroke-linecap="round"';
    const F = 'stroke="#fb923c" stroke-width="2.5" fill="none" stroke-linejoin="round"';
    const box = `<rect x="12" y="8" width="76" height="44" ${F}/>`;
    const op = item.operation;
    let inner = '';
    if (op === 'swing') {
      inner = `<line x1="88" y1="52" x2="12" y2="8" ${S}/>`;
    } else if (op === 'swing_double' || op === 'casement') {
      inner = `<path d="M 50 8 L 14 50 Z M 50 8 L 86 50 Z" ${F}/>`;
    } else if (op === 'swing_double_ego') {
      inner = `<line x1="50" y1="8" x2="12" y2="52" ${S}/><line x1="50" y1="8" x2="88" y2="52" ${S}/>`;
    } else if (op === 'sliding') {
      inner = `<line x1="18" y1="30" x2="82" y2="30" ${S}/><path d="M 26 22 L 14 30 L 26 38" ${S}/><path d="M 74 22 L 86 30 L 74 38" ${S}/>`;
    } else if (op === 'awning') {
      inner = `<path d="M 12 10 L 50 34 L 88 10" ${S}/>`;
    } else if (op === 'hopper') {
      inner = `<path d="M 12 50 L 50 26 L 88 50" ${S}/>`;
    } else if (op === 'pivot') {
      inner = `<line x1="20" y1="48" x2="80" y2="12" ${S}/><circle cx="50" cy="30" r="4" fill="#fb923c"/>`;
    } else if (op === 'louver') {
      inner = [16, 26, 36, 46].map(y => `<line x1="16" y1="${y}" x2="84" y2="${y}" ${S}/>`).join('');
    } else if (op === 'shutter') {
      inner = [14, 21, 28, 35, 42, 49].map(y => `<line x1="14" y1="${y}" x2="86" y2="${y}" stroke="#fb923c" stroke-width="2" fill="none"/>`).join('');
    } else {
      inner = `<line x1="12" y1="8" x2="88" y2="52" stroke="#fb923c" stroke-width="2" opacity="0.55"/>`;
    }
    return `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">${box}${inner}</svg>`;
  },

  selectDoorWindowCatalog(id) {
    const item = CF._dwCatalog.find(entry => entry.id === id);
    if (!item) return;
    CF._dwSelection = item;

    setVal('dw-cat', item.category);
    setVal('dw-op', item.operation);
    setVal('dw-panel', item.panel_style);
    setVal('dw-frame', item.frame_material === 'steel' ? 'steel' : 'aluminum');
    setVal('dw-depth', item.frame_depth_mm || 100);
    setVal('dw-leaf', item.leaf_thickness_mm || 40);
    setVal('dw-mullion', item.mullion_width_mm || 0);

    document.querySelectorAll('.dw-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.dwId === id);
    });

    let bar = el('dw-selected-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dw-selected-bar';
      bar.className = 'dw-selected-bar';
      el('dw-gallery-grid').parentNode.insertBefore(bar, el('dw-gallery-grid').nextSibling);
    }
    bar.innerHTML = `<span>✓ ${item.name} (${item.id})</span><button type="button" class="dw-clear">✕ ยกเลิก</button>`;
    bar.querySelector('.dw-clear').addEventListener('click', () => {
      CF._dwSelection = null;
      bar.remove();
      document.querySelectorAll('.dw-card.selected').forEach(c => c.classList.remove('selected'));
    });

    CF.toast(`เลือกแบบ ${item.name} — ขนาด ${item.width_mm}x${item.height_mm} มม.`, 'info');
  },

  showContextualDrawer(action, toolTitle) {
    const drawer = el('contextual-tool-drawer');
    const drawerTitle = el('drawer-tool-title');
    if (!drawer) return;

    const drawerMap = {
      'drawWall': { id: 'drawer-wall', title: '🧱 ตั้งค่าผนัง (Wall Settings)' },
      'placeColumn': { id: 'drawer-column', title: '🏛 ตั้งค่าเสา (Column Settings)' },
      'drawBeam': { id: 'drawer-beam', title: '🏗 ตั้งค่าคาน (Beam Settings)' },
      'placeDoorWindow': { id: 'drawer-door-window', title: '🚪 ตั้งค่าประตู-หน้าต่าง (Door/Window)' },
      'drawRoof': { id: 'drawer-roof', title: '🏠 ตั้งค่าหลังคา (Roof Settings)' },
      'drawRevitAutoRoof': { id: 'drawer-roof', title: '🏠 ตั้งค่าหลังคา Auto Revit' },
      'generateHipGableRoof': { id: 'drawer-roof', title: '🏠 ตั้งค่าหลังคาจั่ว/ปั้นหยา' },
      'drawFloor': { id: 'drawer-floor', title: '🟦 ตั้งค่าพื้น (Floor Settings)' },
      'drawStructuralFloor': { id: 'drawer-floor', title: '🟦 ตั้งค่าพื้นโครงสร้าง (Slab Settings)' },
      'drawCeiling': { id: 'drawer-ceiling', title: '☁️ ตั้งค่าฝ้าเพดาน (Ceiling Settings)' },
      'profileSweep': { id: 'drawer-sweep', title: '➰ ตั้งค่าบัว/โปรไฟล์ (Profile Sweep)' },
    };

    const target = drawerMap[action];
    if (target) {
      document.querySelectorAll('.drawer-panel').forEach(p => p.style.display = 'none');
      const panel = el(target.id);
      if (panel) panel.style.display = 'block';
      if (drawerTitle) drawerTitle.textContent = target.title || `⚙️ ${toolTitle}`;
      drawer.style.display = 'block';
      drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      drawer.style.display = 'none';
    }
  },

  hideContextualDrawer() {
    const drawer = el('contextual-tool-drawer');
    if (drawer) drawer.style.display = 'none';
    const banner = el('active-tool-banner');
    if (banner) banner.style.display = 'none';
    document.querySelectorAll('.ribbon-btn').forEach(b => b.classList.remove('active'));
  },

  initQuickRibbon() {
    const banner = document.getElementById('active-tool-banner');
    const bannerText = document.getElementById('active-tool-text');
    const cancelBtn = document.getElementById('btn-cancel-tool');
    const closeDrawerBtn = document.getElementById('btn-close-drawer');

    // Ribbon category tabs switcher
    const ribbonTabs = document.querySelectorAll('.ribbon-tab');
    const groupBlocks = document.querySelectorAll('.ribbon-group-block');

    ribbonTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const cat = tab.dataset.tab;
        ribbonTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        groupBlocks.forEach(block => {
          if (cat === 'all' || block.dataset.category === cat) {
            block.classList.remove('hidden');
          } else {
            block.classList.add('hidden');
          }
        });
      });
    });

    document.querySelectorAll('.ribbon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const toolName = btn.dataset.toolName || btn.title || 'เครื่องมือ';
        document.querySelectorAll('.ribbon-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (banner && bannerText) {
          bannerText.textContent = `กำลังใช้งาน: ${toolName} • คลิกในโมเดลเพื่อทำงาน`;
          banner.style.display = 'flex';
        }

        CF.showContextualDrawer(action, toolName);
      });
    });

    if (closeDrawerBtn) {
      closeDrawerBtn.addEventListener('click', () => {
        const drawer = el('contextual-tool-drawer');
        if (drawer) drawer.style.display = 'none';
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        CF.hideContextualDrawer();
        CF.toast('ยกเลิกเครื่องมือแล้ว (Switched to Select Tool)', 'info');
      });
    }

    // Esc key resets active banner and drawer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        CF.hideContextualDrawer();
      }
    });
  },



  // --- AI MCP WebSocket Bridge ---
  initWebSocket() {
    this.ws = new WebSocket('ws://localhost:8765');
    this.ws.onopen = () => {
      console.log('[ConstructFlow] Connected to MCP WebSocket Server');
      CF._renderStatus(); // Will update connection status icon if we add one
    };
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'execute_command') {
          // Pass the command to Ruby
          CF.send('dispatch_ai_command', {
            command_id: data.command_id, // so we can reply
            command_name: data.command_name,
            params: data.params || {}
          });
        }
      } catch (err) {
        console.error('WebSocket parse error', err);
      }
    };
    this.ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(() => CF.initWebSocket(), 3000);
    };
    this.ws.onerror = (err) => {
      // Handled by onclose
    };
  },
  
  sendWebSocketReply(command_id, status, payload, errors) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'command_result',
        command_id: command_id,
        status: status,
        payload: payload,
        errors: errors
      }));
    }
  },
  initQuickPills() {
    // Generic preset pills with data-target & data-val
    document.querySelectorAll('.preset-pill[data-target]').forEach(pill => {
      pill.addEventListener('click', () => {
        const targetId = pill.dataset.target;
        const val = pill.dataset.val;
        const input = document.getElementById(targetId);
        if (input) {
          input.value = val;
          input.dispatchEvent(new Event('change'));
        }

        // Material preset for roof
        if (pill.dataset.mat) {
          const matSel = document.getElementById('roof-mat');
          if (matSel) matSel.value = pill.dataset.mat;
        }

        // Door/window catalog pills: also set operation & panel style
        if (pill.dataset.op) {
          const opSel = document.getElementById('dw-op');
          if (opSel) opSel.value = pill.dataset.op;
        }
        if (pill.dataset.style) {
          const styleSel = document.getElementById('dw-panel');
          if (styleSel) styleSel.value = pill.dataset.style;
        }

        const row = pill.closest('.quick-pill-row');
        if (row) {
          row.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
        }
      });
    });

    // Column quick pills
    document.querySelectorAll('.col-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const w = pill.dataset.w;
        const d = pill.dataset.d;
        const preset = pill.dataset.preset;
        const wInput = document.getElementById('col-w');
        const dInput = document.getElementById('col-d');
        const presetSelect = document.getElementById('col-preset');
        if (wInput) wInput.value = w;
        if (dInput) dInput.value = d;
        if (presetSelect) presetSelect.value = preset;

        const row = pill.closest('.quick-pill-row');
        if (row) {
          row.querySelectorAll('.col-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
        }
      });
    });

    // Beam quick pills
    document.querySelectorAll('.bm-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const w = pill.dataset.w;
        const d = pill.dataset.d;
        const preset = pill.dataset.preset;
        const wInput = document.getElementById('bm-w');
        const dInput = document.getElementById('bm-d');
        const presetSelect = document.getElementById('bm-preset');
        if (wInput) wInput.value = w;
        if (dInput) dInput.value = d;
        if (presetSelect) presetSelect.value = preset;

        const row = pill.closest('.quick-pill-row');
        if (row) {
          row.querySelectorAll('.bm-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
        }
      });
    });

    // Two-way sync: when user manually types into input, sync active pill
    const inputsToSync = ['wall-thick', 'wall-height', 'col-h', 'fl-thick', 'ce-h', 'roof-slope'];
    inputsToSync.forEach(id => {
      const inp = document.getElementById(id);
      if (!inp) return;
      inp.addEventListener('input', () => {
        const val = parseFloat(inp.value);
        const pills = document.querySelectorAll(`.preset-pill[data-target="${id}"]`);
        let matched = false;
        pills.forEach(p => {
          if (parseFloat(p.dataset.val) === val) {
            p.classList.add('active');
            matched = true;
          } else {
            p.classList.remove('active');
          }
        });
        if (!matched) {
          pills.forEach(p => p.classList.remove('active'));
        }
      });
    });
  },

  init() {
    CF.initMainModeTabs();
    CF.initWebSocket();
    CF.initQuickRibbon();
    CF.initQuickPills();
    CF.initDoorWindowGallery();
    CF.initAnchorMatrix();
    CF.initPresets();
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
        const toolName = btn.dataset.toolName || btn.title || action;
        
        // Show banner & drawer for tools
        const banner = el('active-tool-banner');
        const bannerText = el('active-tool-text');
        if (banner && bannerText && btn.dataset.toolName) {
          bannerText.textContent = `กำลังใช้งาน: ${toolName} • คลิกในโมเดลเพื่อทำงาน`;
          banner.style.display = 'flex';
        }
        CF.showContextualDrawer(action, toolName);

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


window.ConstructFlowAI = {
  reply: (command_id, status, payload, errors) => CF.sendWebSocketReply(command_id, status, payload, errors)
};
window.ConstructFlowUI = {
  renderBOQ: (data) => CF.renderBOQ(data),
  openBOQModal: () => CF.openBOQModal(),
  closeBOQModal: () => CF.closeBOQModal(),
  renderTakeoffHUD: (data) => CF.renderTakeoffHUD(data)
};


  // ── 1-CLICK EXTENSION PRESETS (V1.0.0) ──
  document.querySelectorAll('.btn-preset-build').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const presetId = this.getAttribute('data-preset-id');
      if (presetId) {
        CF.toast('กำลังสร้างโมเดล ' + presetId + ' ...', 'info');
        CF.send('create_extension_preset', { preset_id: presetId, x: 0, y: 0, z: 0 });
      }
    });
  });

  // ── THAI BOQ EXCEL EXPORT (V1.0.0) ──
  const btnExportThaiBoq = document.getElementById('btn-export-thai-boq');
  if (btnExportThaiBoq) {
    btnExportThaiBoq.addEventListener('click', function() {
      const factorF = parseFloat(document.getElementById('factor-f-select')?.value || '0.12');
      CF.toast('กำลังจัดทำใบเสนอราคา BOQ (Excel CSV) ...', 'info');
      CF.send('export_thai_boq_excel', { factor_f: factorF });
    });
  }

  // ── THAI A3 DRAWING SHEETS GENERATION (V1.0.0) ──
  const btnGenA3 = document.getElementById('btn-generate-a3-sheets');
  if (btnGenA3) {
    btnGenA3.addEventListener('click', function() {
      const projName = document.getElementById('tb-project-name')?.value || 'โครงการต่อเติมบ้านพักอาศัย';
      const ownerName = document.getElementById('tb-owner-name')?.value || 'เจ้าของอาคาร';
      CF.toast('กำลังตั้งค่า 6 Scenes และเตรียมแบบ A3 ...', 'info');
      CF.send('generate_a3_drawing_sheets', { project_name: projName, owner_name: ownerName });
    });
  }
