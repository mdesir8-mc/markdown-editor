// Side-by-side document comparison. Shared by the Electron app (index.html)
// and the web build (web/index.html).
(function () {
  'use strict';

  const MAX_D = 3000;   // give up on an exact diff past this many edits
  const CONTEXT = 3;    // unchanged lines kept around each change
  const SIMILAR = 0.35; // min shared text before word-level highlighting

  // ---- Diff engine (Myers O(ND)) -----------------------------------------

  function myers(a, b) {
    const n = a.length, m = b.length, max = n + m, off = max;
    const v = new Int32Array(2 * max + 2);
    const trace = [];
    for (let d = 0; d <= Math.min(max, MAX_D); d++) {
      trace.push(v.slice(off - d, off + d + 1));
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
        else x = v[off + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) return backtrack(trace, n, m);
      }
    }
    return null;
  }

  function backtrack(trace, n, m) {
    const ops = [];
    let x = n, y = m;
    for (let d = trace.length - 1; d >= 0; d--) {
      const snap = trace[d];
      const k = x - y;
      let prevX = 0, prevY = 0;
      if (d > 0) {
        const down = k === -d || (k !== d && snap[k - 1 + d] < snap[k + 1 + d]);
        const prevK = down ? k + 1 : k - 1;
        prevX = snap[prevK + d];
        prevY = prevX - prevK;
      }
      while (x > prevX && y > prevY) { x--; y--; ops.push({ t: '=', i: x, j: y }); }
      if (d > 0) {
        if (x === prevX) { y--; ops.push({ t: '+', j: y }); }
        else { x--; ops.push({ t: '-', i: x }); }
      }
    }
    return ops.reverse();
  }

  // Diff two arrays; returns [{t:'='|'-'|'+', i?, j?}] (i indexes a, j indexes b).
  function diffSeq(a, b) {
    let s = 0;
    while (s < a.length && s < b.length && a[s] === b[s]) s++;
    let ea = a.length, eb = b.length;
    while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }

    const ops = [];
    for (let i = 0; i < s; i++) ops.push({ t: '=', i, j: i });
    const mid = myers(a.slice(s, ea), b.slice(s, eb));
    if (mid) {
      for (const op of mid) {
        if (op.t === '=') ops.push({ t: '=', i: op.i + s, j: op.j + s });
        else if (op.t === '-') ops.push({ t: '-', i: op.i + s });
        else ops.push({ t: '+', j: op.j + s });
      }
    } else {
      for (let i = s; i < ea; i++) ops.push({ t: '-', i });
      for (let j = s; j < eb; j++) ops.push({ t: '+', j });
    }
    for (let k = 0; ea + k < a.length; k++) ops.push({ t: '=', i: ea + k, j: eb + k });
    return ops;
  }

  // ---- Word-level highlighting for paired changed lines ------------------

  const TOKEN_RE = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pushSeg(list, mark, text) {
    const last = list[list.length - 1];
    if (last && last.mark === mark) last.text += text;
    else list.push({ mark, text });
  }

  function segsToHtml(segs, cls) {
    // A lone space between two marked runs reads better marked too.
    for (let i = 1; i < segs.length - 1; i++) {
      if (!segs[i].mark && /^\s+$/.test(segs[i].text) && segs[i - 1].mark && segs[i + 1].mark) segs[i].mark = true;
    }
    const merged = [];
    for (const s of segs) pushSeg(merged, s.mark, s.text);
    return merged.map((s) => (s.mark ? `<mark class="${cls}">${esc(s.text)}</mark>` : esc(s.text))).join('');
  }

  // Returns {l, r} HTML for the two lines, or null when they are too different.
  function wordDiff(a, b) {
    const ta = a.match(TOKEN_RE) || [];
    const tb = b.match(TOKEN_RE) || [];
    const ops = diffSeq(ta, tb);
    let shared = 0;
    for (const op of ops) if (op.t === '=') shared += ta[op.i].length;
    if (shared / Math.max(a.length, b.length, 1) < SIMILAR) return null;

    const l = [], r = [];
    for (const op of ops) {
      if (op.t === '=') { pushSeg(l, false, ta[op.i]); pushSeg(r, false, tb[op.j]); }
      else if (op.t === '-') pushSeg(l, true, ta[op.i]);
      else pushSeg(r, true, tb[op.j]);
    }
    return { l: segsToHtml(l, 'w-del'), r: segsToHtml(r, 'w-add') };
  }

  // ---- Rows ---------------------------------------------------------------

  function splitLines(text) {
    let t = text.replace(/\r\n?/g, '\n');
    if (t.endsWith('\n')) t = t.slice(0, -1);
    return t.split('\n');
  }

  // Aligns the two documents into display rows:
  //   eq  – same line on both sides
  //   chg – a line changed (paired removed + added line)
  //   del – line only on the left      add – line only on the right
  function buildRows(aLines, bLines) {
    const ops = diffSeq(aLines, bLines);
    const rows = [];
    let k = 0;
    while (k < ops.length) {
      if (ops[k].t === '=') { rows.push({ type: 'eq', i: ops[k].i, j: ops[k].j }); k++; continue; }
      const dels = [], adds = [];
      while (k < ops.length && ops[k].t !== '=') {
        (ops[k].t === '-' ? dels : adds).push(ops[k]);
        k++;
      }
      const n = Math.max(dels.length, adds.length);
      for (let x = 0; x < n; x++) {
        const d = dels[x], a = adds[x];
        const row = { type: d && a ? 'chg' : d ? 'del' : 'add', i: d ? d.i : -1, j: a ? a.j : -1 };
        if (d && a) {
          const wd = wordDiff(aLines[d.i], bLines[a.j]);
          if (wd) { row.lw = wd.l; row.rw = wd.r; }
        }
        rows.push(row);
      }
    }
    return rows;
  }

  // ---- UI -------------------------------------------------------------------

  function init(opts) {
    const state = { left: null, right: null };
    let active = false;
    let groups = [];
    let pos = -1;

    const root = document.createElement('div');
    root.id = 'compare';
    root.innerHTML = `
      <div id="cmp-bar">
        <div class="cmp-side"><span class="cmp-name" data-name="left"></span><button class="cmp-btn" data-act="pick-left">Open…</button></div>
        <div class="cmp-side"><span class="cmp-name" data-name="right"></span><button class="cmp-btn" data-act="pick-right">Open…</button></div>
      </div>
      <div id="cmp-tools">
        <button class="cmp-btn" data-act="prev" title="Previous change">▲ Prev</button>
        <button class="cmp-btn" data-act="next" title="Next change">▼ Next</button>
        <span id="cmp-pos"></span>
        <span id="cmp-summary"></span>
        <span class="cmp-spacer"></span>
        <button class="cmp-btn" data-act="editor" title="Use the editor text as the left side">Use editor as left</button>
        <button class="cmp-btn" data-act="swap" title="Swap left and right">⇄ Swap</button>
        <button class="cmp-btn" data-act="close" title="Back to the editor (Esc)">Close</button>
      </div>
      <div id="cmp-scroll"><div id="cmp-grid"></div></div>`;
    document.body.appendChild(root);

    const grid = root.querySelector('#cmp-grid');
    const scroller = root.querySelector('#cmp-scroll');
    const posEl = root.querySelector('#cmp-pos');
    const summaryEl = root.querySelector('#cmp-summary');
    const names = { left: root.querySelector('[data-name="left"]'), right: root.querySelector('[data-name="right"]') };

    function cell(cls, text, html) {
      const d = document.createElement('div');
      d.className = cls;
      if (html != null) d.innerHTML = html;
      else d.textContent = text;
      return d;
    }

    function rowCells(r, aLines, bLines) {
      const hasL = r.i >= 0, hasR = r.j >= 0;
      const lc = r.type === 'eq' ? '' : hasL ? ' del' : ' empty';
      const rc = r.type === 'eq' ? '' : hasR ? ' add' : ' empty';
      return [
        cell('ln l' + lc, hasL ? String(r.i + 1) : ''),
        cell('tx l' + lc, hasL ? aLines[r.i] : '', r.lw),
        cell('ln r' + rc, hasR ? String(r.j + 1) : ''),
        cell('tx r' + rc, hasR ? bLines[r.j] : '', r.rw),
      ];
    }

    function updatePos() {
      posEl.textContent = groups.length ? `${pos + 1} / ${groups.length}` : '';
    }

    function go(delta) {
      if (!groups.length) return;
      pos = pos < 0 ? (delta > 0 ? 0 : groups.length - 1) : (pos + delta + groups.length) % groups.length;
      const cells = groups[pos];
      cells[0].scrollIntoView({ block: 'center' });
      cells.forEach((c) => c.classList.add('flash'));
      setTimeout(() => cells.forEach((c) => c.classList.remove('flash')), 800);
      updatePos();
    }

    function render() {
      for (const side of ['left', 'right']) {
        names[side].textContent = state[side] ? state[side].name : 'Choose a file…';
        names[side].classList.toggle('empty', !state[side]);
      }
      grid.textContent = '';
      groups = [];
      pos = -1;
      updatePos();

      if (!state.left || !state.right) {
        summaryEl.textContent = '';
        const msg = document.createElement('div');
        msg.className = 'cmp-empty';
        msg.textContent = 'Open a file for the right side to compare it with the left.';
        grid.appendChild(msg);
        return;
      }

      const aLines = splitLines(state.left.text);
      const bLines = splitLines(state.right.text);
      const rows = buildRows(aLines, bLines);
      const cells = rows.map((r) => rowCells(r, aLines, bLines));

      let added = 0, removed = 0;
      rows.forEach((r, idx) => {
        if (r.type === 'eq') return;
        if (r.i >= 0) removed++;
        if (r.j >= 0) added++;
        if (idx === 0 || rows[idx - 1].type === 'eq') groups.push(cells[idx]);
      });

      if (!groups.length) {
        summaryEl.textContent = 'The two documents are identical.';
      } else {
        summaryEl.innerHTML = `${groups.length} change${groups.length === 1 ? '' : 's'} · <span class="s-add">+${added}</span> <span class="s-del">−${removed}</span>`;
      }

      const frag = document.createDocumentFragment();
      let idx = 0;
      while (idx < rows.length) {
        if (rows[idx].type !== 'eq') { cells[idx++].forEach((c) => frag.appendChild(c)); continue; }
        let end = idx;
        while (end < rows.length && rows[end].type === 'eq') end++;
        const head = idx === 0 ? 0 : CONTEXT;
        const tail = end === rows.length ? 0 : CONTEXT;
        const hidden = end - idx - head - tail;
        const fold = groups.length && hidden > 2;
        for (let r = idx; r < end; r++) {
          if (fold && r === idx + head) {
            const hiddenCells = [];
            for (let h = r; h < end - tail; h++) hiddenCells.push(...cells[h]);
            const el = document.createElement('div');
            el.className = 'cmp-fold';
            el.textContent = `⋯ ${hidden} unchanged lines — click to expand`;
            el.addEventListener('click', () => { el.before(...hiddenCells); el.remove(); });
            frag.appendChild(el);
            r = end - tail - 1;
            continue;
          }
          cells[r].forEach((c) => frag.appendChild(c));
        }
        idx = end;
      }
      grid.appendChild(frag);
      scroller.scrollTop = 0;
    }

    function snapshot() {
      const cur = opts.getCurrent();
      return { name: cur.name, text: cur.text, loaded: false };
    }

    async function pick(side) {
      const f = await opts.pickFile();
      if (!f) return;
      state[side] = { name: f.name, text: f.text, loaded: true };
      render();
    }

    function open(o) {
      if (!state.left || !state.left.loaded) state.left = snapshot();
      active = true;
      root.classList.add('active');
      opts.panes.style.display = 'none';
      if (opts.onChange) opts.onChange(true);
      render();
      if (!state.right && !(o && o.prompt === false)) pick('right');
    }

    function close() {
      active = false;
      root.classList.remove('active');
      opts.panes.style.display = '';
      if (opts.onChange) opts.onChange(false);
    }

    root.addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      if (act === 'pick-left') pick('left');
      else if (act === 'pick-right') pick('right');
      else if (act === 'prev') go(-1);
      else if (act === 'next') go(1);
      else if (act === 'close') close();
      else if (act === 'editor') { state.left = snapshot(); render(); }
      else if (act === 'swap') { [state.left, state.right] = [state.right, state.left]; render(); }
    });

    document.addEventListener('keydown', (e) => {
      if (active && e.key === 'Escape') close();
    });

    return { open, close, pick, toggle: () => (active ? close() : open()), isActive: () => active };
  }

  const api = { init, diffSeq, buildRows, wordDiff, splitLines };
  if (typeof window !== 'undefined') window.Compare = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
