/* Weight tracker module for the КБЖУ diary mini app.
   Self-contained: injects its own styles, markup and logic.
   Talks to the host app only through the small dependency object
   passed into WeightTracker.init({ storage, haptic, escapeHtml, round1 }).
   Storage key used: 'weight' -> JSON array of {date:'YYYY-MM-DD', weight:number} */
window.WeightTracker = (function () {
  let deps = null;
  let entries = []; // sorted ascending by date

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .weight-color { color: #5C7A99; }
      .weight-stats{
        display:flex; gap:18px; margin: 4px 0 16px;
      }
      .weight-stat{ flex:1; background:var(--card); color:var(--card-text); border-radius:14px; padding:12px; text-align:center; }
      .weight-stat .val{ font-size:17px; font-weight:800; }
      .weight-stat .val.up{ color:#C97064; }
      .weight-stat .val.down{ color:#8A9B6E; }
      .weight-stat .lbl{ font-size:11px; color:var(--hint); margin-top:2px; }

      .weight-chart-wrap{ background:var(--card); border-radius:14px; padding:14px 10px 8px; margin-bottom:16px; }
      .weight-chart-wrap svg{ width:100%; display:block; }
      .weight-chart-empty{ text-align:center; color:var(--hint); font-size:12px; padding: 14px 6px; }
      .weight-axis-label{ font-size:9px; fill:var(--hint); }

      .weight-add-row{ display:flex; gap:8px; margin-bottom:16px; align-items:flex-end; }
      .weight-add-row .field{ margin-bottom:0; }
      .weight-add-row .field:first-child{ flex:1.3; }
      .weight-add-row .field:nth-child(2){ flex:1; }
      .weight-add-row button{
        border:none; background:var(--button); color:var(--button-text);
        border-radius:12px; padding:11px 16px; font-size:14px; font-weight:700; flex-shrink:0;
      }

      .weight-history{ max-height: 260px; overflow-y:auto; }
      .weight-history-row{
        display:flex; align-items:center; justify-content:space-between;
        background:var(--card); border-radius:12px; padding:10px 14px; margin-bottom:6px;
      }
      .weight-history-date{ font-size:13px; color:var(--card-text); }
      .weight-history-val{ font-size:14px; font-weight:700; color:var(--card-text); margin-left:auto; margin-right:10px; }
      .weight-history-del{ border:none; background:transparent; color:var(--hint); font-size:16px; padding:2px 4px; }
      .weight-empty-hist{ text-align:center; color:var(--hint); font-size:12px; padding: 10px; }
    `;
    document.head.appendChild(style);
  }

  function injectMarkup() {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.id = 'weightOverlay';
    overlay.innerHTML = `
      <div class="sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <h2>Вес тела</h2>
          <button class="sheet-close" id="weightClose">✕</button>
        </div>

        <div class="weight-stats" id="weightStats"></div>

        <div class="weight-chart-wrap" id="weightChartWrap"></div>

        <div class="weight-add-row">
          <div class="field">
            <label>Дата</label>
            <input type="date" id="weightDate">
          </div>
          <div class="field">
            <label>Вес, кг</label>
            <input type="number" id="weightValue" inputmode="decimal" step="0.1" placeholder="70.0">
          </div>
          <button id="weightSave">Добавить</button>
        </div>

        <div class="weight-history" id="weightHistory"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('weightClose').addEventListener('click', close);

    const dateInput = document.getElementById('weightDate');
    dateInput.value = todayStr();

    document.getElementById('weightSave').addEventListener('click', async () => {
      const date = dateInput.value;
      const val = parseFloat(document.getElementById('weightValue').value);
      if (!date || !val) { deps.haptic('notification', 'error'); return; }
      await upsertEntry(date, val);
      document.getElementById('weightValue').value = '';
      deps.haptic('notification', 'success');
      renderAll();
    });

    document.getElementById('weightHistory').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      entries = entries.filter(en => en.date !== btn.getAttribute('data-del'));
      await save();
      deps.haptic('impact', 'light');
      renderAll();
    });
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function load() {
    const raw = await deps.storage.get('weight');
    entries = raw ? JSON.parse(raw) : [];
    entries.sort((a, b) => a.date.localeCompare(b.date));
  }

  async function save() {
    await deps.storage.set('weight', JSON.stringify(entries));
  }

  async function upsertEntry(date, weight) {
    const existing = entries.find(en => en.date === date);
    if (existing) existing.weight = weight;
    else entries.push({ date, weight });
    entries.sort((a, b) => a.date.localeCompare(b.date));
    await save();
  }

  function formatShort(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function renderStats() {
    const el = document.getElementById('weightStats');
    if (entries.length === 0) { el.innerHTML = ''; return; }
    const last = entries[entries.length - 1];
    const first = entries[0];
    const diff = deps.round1(last.weight - first.weight);
    const diffClass = diff > 0 ? 'up' : (diff < 0 ? 'down' : '');
    const diffLabel = diff > 0 ? `+${diff} кг` : `${diff} кг`;
    el.innerHTML = `
      <div class="weight-stat"><div class="val">${last.weight} кг</div><div class="lbl">Текущий</div></div>
      <div class="weight-stat"><div class="val ${diffClass}">${entries.length > 1 ? diffLabel : '—'}</div><div class="lbl">С первой записи</div></div>
      <div class="weight-stat"><div class="val">${entries.length}</div><div class="lbl">Записей</div></div>
    `;
  }

  function renderChart() {
    const wrap = document.getElementById('weightChartWrap');
    if (entries.length < 2) {
      wrap.innerHTML = `<div class="weight-chart-empty">Добавьте ещё одну запись, чтобы увидеть график</div>`;
      return;
    }
    const w = 300, h = 130, padX = 8, padY = 16;
    const weights = entries.map(en => en.weight);
    let min = Math.min(...weights), max = Math.max(...weights);
    if (min === max) { min -= 1; max += 1; }
    const range = max - min;
    const pad = range * 0.15 || 1;
    min -= pad; max += pad;

    const n = entries.length;
    const x = i => padX + (i / (n - 1)) * (w - padX * 2);
    const y = v => padY + (1 - (v - min) / (max - min)) * (h - padY * 2 - 14);

    const points = entries.map((en, i) => `${x(i)},${y(en.weight)}`).join(' ');
    const areaPoints = `${x(0)},${h - 14} ${points} ${x(n - 1)},${h - 14}`;

    const dots = entries.map((en, i) => `<circle cx="${x(i)}" cy="${y(en.weight)}" r="3" fill="#5C7A99"/>`).join('');

    const firstLabel = formatShort(entries[0].date);
    const lastLabel = formatShort(entries[n - 1].date);

    wrap.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}">
        <polyline points="${areaPoints}" fill="rgba(92,122,153,0.12)" stroke="none"/>
        <polyline points="${points}" fill="none" stroke="#5C7A99" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
        <text class="weight-axis-label" x="${x(0)}" y="${h - 2}" text-anchor="start">${firstLabel}</text>
        <text class="weight-axis-label" x="${x(n - 1)}" y="${h - 2}" text-anchor="end">${lastLabel}</text>
      </svg>
    `;
  }

  function renderHistory() {
    const el = document.getElementById('weightHistory');
    if (entries.length === 0) {
      el.innerHTML = `<div class="weight-empty-hist">Пока нет записей о весе.</div>`;
      return;
    }
    el.innerHTML = entries.slice().reverse().map(en => `
      <div class="weight-history-row">
        <div class="weight-history-date">${deps.escapeHtml(formatShort(en.date))}</div>
        <div class="weight-history-val">${en.weight} кг</div>
        <button class="weight-history-del" data-del="${en.date}">✕</button>
      </div>
    `).join('');
  }

  function renderAll() {
    renderStats();
    renderChart();
    renderHistory();
  }

  function close() {
    document.getElementById('weightOverlay').classList.remove('open');
  }

  async function open() {
    document.getElementById('weightDate').value = todayStr();
    document.getElementById('weightOverlay').classList.add('open');
    await load();
    renderAll();
  }

  function init(sharedDeps) {
    deps = sharedDeps;
    injectStyles();
    injectMarkup();
  }

  return { init, open };
})();