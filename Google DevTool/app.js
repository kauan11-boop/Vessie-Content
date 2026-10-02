/* ═══════════════════════════════════════════════════════════════════
   🎮✍️ MATIFIC ULTIMATE + REDAÇÃO STUDIO v6.0 — UNIFIED
   F12 → Console → cole tudo → Enter
   
   APIs:
     window.MatificPanel.spawn.spawnCustom(slug, {stars:5})
     window.RedacaoStudio.insert(texto)
     window.RedacaoStudio.stats()
     window.RedacaoStudio.focus()
     window.RedacaoStudio.snapshot()
   ═══════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const PANEL_ID = 'rs-unified-host';
document.getElementById(PANEL_ID)?.remove();
window.__rsInstance?.destroy?.();


/* ── 1. CONFIG ─────────────────────────────────────────────── */
const CFG = {
  z: 2147483647,
  maxLog: 500,
  maxEvents: 300,
  starScoreMap: { 1: 500, 2: 1000, 3: 1500, 4: 2000, 5: 2500 }
};

/* ── 2. UTILS ──────────────────────────────────────────────── */
const Utils = {
  genId: (n = 16) => Array.from({ length: n }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random()*36)]).join(''),
  uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }),
  time: () => { const d = new Date(); return d.toTimeString().slice(0,8)+'.'+String(d.getMilliseconds()).padStart(3,'0'); },
  fmtDate: ts => new Date(ts).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
  esc: s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  truncate: (s, n = 200) => s && s.length > n ? s.slice(0, n) + '…' : s,
  safeJson: (o, i = 2) => { try { return JSON.stringify(o, (k,v)=>v===undefined?null:v, i); } catch { return String(o); } },
  parseMaybeJson: v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } },
  cookie: n => { const m = document.cookie.match(new RegExp('(^| )'+n+'=([^;]+)')); return m ? m[2] : null; },
  download: (name, content, mime='application/json') => {
    const b = new Blob([content], { type: mime }); const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  },
  copyText: async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
};

/* ── 3. LOGGER ─────────────────────────────────────────────── */
const Logger = {
  history: [],
  log(msg, type = 'info', tag = null) {
    const e = { t: Utils.time(), msg: String(msg), type, tag };
    this.history.push(e);
    if (this.history.length > CFG.maxLog * 2) this.history.shift();
    const color = { error:'#ff4d6d', warn:'#ffb547', success:'#00d9a3', info:'#4dabf7', out:'#4dabf7', in:'#ff6b9d' }[type] || '#00d9a3';
    try { console[type==='error'?'error':type==='warn'?'warn':'log'](`%c[Studio]`, `color:${color};font-weight:bold`, tag||'', msg); } catch {}
    try { UI.appendLog(e); } catch {}
  },
  ok(m){ this.log(m,'success'); }, err(m){ this.log(m,'error'); }, info(m){ this.log(m,'info'); }, warn(m){ this.log(m,'warn'); }
};

/* ── 4. STORE UNIFICADO ───────────────────────────────────── */
const KEY = 'redacaoStudio.v4';
const DEFAULTS = {
  settings: {
    // UI
    dark: true, fontSize: 12.5,
    // Typing
    speed: 16, grain: 'word', pausePunct: true, autosave: true,
    // Writing
    min: 0, max: 0, goal: 500, snapEvery: 5,
    // Matific
    stars: 5, score: 2500, autoDelay: 800, spawnBroadcast: true,
    spawnBaseUrl: '', spawnToken: ''
  },
  autoText: '', drafts: [], history: [], snapshots: [], sessions: [],
  notes: '', checklist: {},
  spyEnabled: true
};
const clone = o => JSON.parse(JSON.stringify(o));
const Store = {
  data: clone(DEFAULTS),
  load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY));
      if (r) this.data = { ...this.data, ...r, settings: { ...DEFAULTS.settings, ...(r.settings || {}) } };
    } catch {}
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {} },
  reset() { this.data = clone(DEFAULTS); this.save(); }
};

/* ── 5. COUNTSYNC ──────────────────────────────────────────── */
const CountSync = {
  strip: t => String(t || '').replace(/<[^>]*>/g, '').replace(/\.(?=\S)/g, '. '),
  chars(t) { return this.strip(t).length; },
  words(t) { const s = this.strip(t); return s.trim() ? s.trim().split(/\s+/).filter(w => w.length > 0).length : 0; }
};


/* ── CORE EXT: barramento de eventos, registro de módulos, API compartilhada e segurança ──
   Ordem: após 01-core.js (Utils/Store/Logger prontos). Não redeclara nomes existentes. */

const EventBus = {
  _map: new Map(),
  on(evt, fn) {
    if (!this._map.has(evt)) this._map.set(evt, new Set());
    this._map.get(evt).add(fn);
    return () => this.off(evt, fn);
  },
  once(evt, fn) {
    const wrap = (...a) => { this.off(evt, wrap); fn(...a); };
    return this.on(evt, wrap);
  },
  off(evt, fn) {
    if (!fn) { this._map.delete(evt); return; }
    this._map.get(evt)?.delete(fn);
  },
  emit(evt, payload) {
    const s = this._map.get(evt);
    if (!s) return 0;
    let n = 0;
    [...s].forEach(fn => { try { fn(payload); n++; } catch (e) { try { Logger.warn('EventBus: ' + e.message); } catch {} } });
    return n;
  },
  events() { return [...this._map.keys()]; }
};

const ModuleRegistry = {
  _mods: new Map(),
  register(name, api, meta = {}) {
    this._mods.set(name, { api, meta, at: Date.now() });
    try { EventBus.emit('module:registered', { name, meta }); } catch {}
    return api;
  },
  get(name) { return this._mods.get(name)?.api || null; },
  has(name) { return this._mods.has(name); },
  list() { return [...this._mods.keys()]; },
  describe() { return [...this._mods.entries()].map(([name, v]) => ({ name, ...v.meta })); }
};

const RsUtils = {
  clamp(n, a, b) { return Math.min(b, Math.max(a, n)); },
  words(t) { const s = String(t || '').trim(); return s ? s.split(/\s+/).length : 0; },
  todayKey(d = new Date()) { return d.toISOString().slice(0, 10); },
  debounce(fn, ms = 300) { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  levelOf(score) { return score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'err'; }
};

const RsStoreExt = {
  ensure() {
    const d = Store.data;
    d.goals = d.goals || { dailyWords: 500, weeklyTexts: 3 };
    d.daily = d.daily || {};
    d.repertoireUses = d.repertoireUses || [];
    try { Store.save(); } catch {}
    return d;
  },
  getDaily(key) {
    this.ensure();
    if (!Store.data.daily[key]) Store.data.daily[key] = { words: 0, sessions: 0, mins: 0, texts: 0 };
    return Store.data.daily[key];
  },
  trackWords(words, mins = 0) {
    const k = RsUtils.todayKey();
    const e = this.getDaily(k);
    e.words = Math.max(e.words, words);
    e.mins += mins;
    e.sessions += mins > 0 ? 1 : 0;
    if (words > 0) e.texts = Math.max(e.texts, 1);
    try { Store.save(); } catch {}
    try { EventBus.emit('progress:updated', { key: k, entry: e }); } catch {}
    return e;
  }
};

const ShortcutManager = {
  _map: new Map(),
  register(combo, handler, opts = {}) {
    const key = String(combo).toLowerCase();
    if (this._map.has(key) && !opts.force) return { ok: false, err: 'conflict', existing: this._map.get(key).label };
    this._map.set(key, { handler, label: opts.label || key, allowInInput: !!opts.allowInInput });
    return { ok: true };
  },
  resolve(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(String(e.key || '').toLowerCase());
    return parts.join('+');
  },
  install() {
    if (this._installed) return;
    this._installed = true;
    document.addEventListener('keydown', (e) => {
      const combo = this.resolve(e);
      const hit = this._map.get(combo);
      if (!hit) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'textarea' || tag === 'input' || e.target?.isContentEditable;
      if (typing && !hit.allowInInput && e.key !== 'Escape') return; // evita roubar digitação
      try { hit.handler(e); } catch {}
    }, true);
  },
  conflicts() { return [...this._map.keys()]; }
};

const CspHelper = {
  meta() { return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null; },
  trustedTypesAvailable() { return typeof window.trustedTypes !== 'undefined' && !!window.trustedTypes.createPolicy; },
  allowsInlineScript() {
    const c = this.meta() || '';
    if (!c) return 'unknown';
    return /'unsafe-inline'/.test(c) ? true : false;
  },
  describe() {
    return {
      csp: this.meta(),
      trustedTypes: this.trustedTypesAvailable(),
      inlineScript: this.allowsInlineScript(),
      note: 'Bundle roda colado no console; sem inline <script> remoto. Export PDF usa DOM + textContent, sem innerHTML.'
    };
  }
};

const TrustedTypesHelper = {
  _policy: null,
  policy() {
    if (this._policy) return this._policy;
    try {
      if (CspHelper.trustedTypesAvailable()) {
        this._policy = window.trustedTypes.createPolicy('rs-studio', { createHTML: s => String(s), createScript: s => String(s), createScriptURL: s => String(s) });
      }
    } catch {}
    return this._policy;
  },
  // Preferir sempre DOM + textContent. Este helper só documenta a via segura.
  safeText(s) { return String(s ?? ''); }
};

const RsApi = {
  version: '1.0.0',
  bus: EventBus,
  modules: ModuleRegistry,
  utils: RsUtils,
  store: RsStoreExt,
  security: { shortcuts: ShortcutManager, csp: CspHelper, trustedTypes: TrustedTypesHelper }
};

// Objeto do editor compartilhado entre módulos (texto como fonte única).
const EditorObject = {
  getText() {
    try {
      if (typeof QuillBridge !== 'undefined' && QuillBridge.read) {
        const t = QuillBridge.read();
        if (t && t.trim()) return t;
      }
    } catch {}
    try {
      if (typeof UI !== 'undefined' && UI.$) {
        const el = UI.$('.rs-editor');
        if (el) return el.value || '';
      }
    } catch {}
    return '';
  },
  setText(t) {
    try {
      if (typeof QuillBridge !== 'undefined' && QuillBridge.replaceAll) {
        if (QuillBridge.replaceAll(String(t ?? ''))) return true;
      }
    } catch {}
    try {
      if (typeof UI !== 'undefined' && UI.setText) { UI.setText(String(t ?? '')); return true; }
    } catch {}
    return false;
  },
  stats() {
    const t = this.getText();
    return { chars: t.length, words: RsUtils.words(t) };
  }
};

ModuleRegistry.register('EventBus', EventBus, { kind: 'core' });
ModuleRegistry.register('RsApi', RsApi, { kind: 'core' });
ModuleRegistry.register('EditorObject', EditorObject, { kind: 'core' });
ModuleRegistry.register('ShortcutManager', ShortcutManager, { kind: 'security' });
ModuleRegistry.register('CspHelper', CspHelper, { kind: 'security' });

const Vessie = (() => {
  const metrics = new Map();
  const state = {
    config: {
      dailyWordGoal: 500,
      focusMinutes: 25,
      lmEndpoint: 'http://localhost:1234/v1',
      lmModel: '',
      theme: 'midnight',
      objectives: []
    },
    latest: null
  };
  const storageKey = 'vessie.config.v1';

  return {
    version: '1.0.0',
    state,
    registerMetric(id, group, label, evaluate) {
      if (!/^[a-z0-9.-]+$/u.test(id) || typeof evaluate !== 'function' || metrics.has(id)) {
        throw new Error(`Métrica inválida ou duplicada: ${id}`);
      }
      const metric = { id, group, label, evaluate };
      metrics.set(id, metric);
      if (typeof ModuleRegistry !== 'undefined') {
        ModuleRegistry.register(`VessieMetric:${id}`, metric, { kind: 'analysis', group });
      }
    },
    metricIds() { return [...metrics.keys()].sort(); },
    analyze(input) {
      const text = String(input || '').replace(/\r\n?/gu, '\n');
      const words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || [];
      const sentences = text.split(/[.!?…]+(?:["'”’)]*)\s*/u).map(part => part.trim()).filter(Boolean);
      const paragraphs = text.split(/\n\s*\n/u).map(part => part.trim()).filter(Boolean);
      const frequencies = new Map();
      for (const word of words) {
        const normalized = word.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
        frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
      }
      const context = { text, normalized: text.toLocaleLowerCase('pt-BR'), words, sentences, paragraphs, frequencies };
      const results = [...metrics.values()].map(metric => {
        const value = metric.evaluate(context) || {};
        return {
          id: metric.id,
          group: metric.group,
          label: metric.label,
          score: Math.round(Math.max(0, Math.min(100, Number(value.score) || 0))),
          finding: String(value.finding || ''),
          advice: String(value.advice || '')
        };
      });
      const grouped = new Map();
      for (const result of results) {
        if (!grouped.has(result.group)) grouped.set(result.group, []);
        grouped.get(result.group).push(result.score);
      }
      const summary = Object.fromEntries([...grouped].map(([group, scores]) => [
        group,
        Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      ]));
      const report = {
        schema: 'vessie-report/1.0',
        generatedAt: new Date().toISOString(),
        counts: {
          words: words.length,
          characters: text.length,
          sentences: sentences.length,
          paragraphs: paragraphs.length,
          uniqueWords: frequencies.size,
          lexicalDiversity: words.length ? Math.round(frequencies.size / words.length * 100) : 0
        },
        summary,
        metrics: results
      };
      state.latest = report;
      return report;
    },
    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved && typeof saved === 'object') {
          state.config = { ...state.config, ...saved };
        } else {
          const existingGoal = Number(Store.data?.goals?.dailyWords);
          if (Number.isInteger(existingGoal) && existingGoal >= 50) state.config.dailyWordGoal = existingGoal;
        }
      } catch (error) {
        Logger.warn(`Vessie: configurações não carregadas (${error.message}).`);
      }
      return state.config;
    },
    save() {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state.config));
      } catch (error) {
        Logger.err(`Vessie: erro ao salvar configuração (${error.message}).`);
        throw error;
      }
      return state.config;
    },
    parseProgram(source) {
      const next = { ...state.config };
      const allowed = new Set(['dailyWordGoal', 'focusMinutes', 'lmEndpoint', 'lmModel', 'theme']);
      const lines = String(source || '').split(/\r?\n/u);
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index].replace(/#.*$/u, '').trim();
        if (!line) continue;
        const match = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.+)$/u.exec(line);
        if (!match || !allowed.has(match[1])) throw new Error(`Comando Vessie inválido na linha ${index + 1}.`);
        const [, key, raw] = match;
        const value = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
        if (key === 'dailyWordGoal' || key === 'focusMinutes') {
          const amount = Number(value);
          const bounds = key === 'focusMinutes' ? [1, 180] : [50, 10000];
          if (!Number.isInteger(amount) || amount < bounds[0] || amount > bounds[1]) {
            throw new Error(`Valor inválido para ${key} na linha ${index + 1}.`);
          }
          next[key] = amount;
        } else if (key === 'lmEndpoint') {
          const endpoint = new URL(value);
          if (endpoint.protocol !== 'http:' || !/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/u.test(endpoint.hostname)) {
            throw new Error('lmEndpoint aceita somente localhost/127.x/::1 por HTTP.');
          }
          next[key] = endpoint.toString().replace(/\/$/u, '');
        } else if (key === 'theme') {
          if (!['midnight', 'paper', 'forest', 'ocean'].includes(value)) {
            throw new Error(`Tema Vessie desconhecido na linha ${index + 1}.`);
          }
          next[key] = value;
        } else {
          next[key] = value.slice(0, 120);
        }
      }
      state.config = next;
      this.save();
      return next;
    }
  };
})();
/* ── 6. FIBERLENS ──────────────────────────────────────────── */
const FiberLens = {
  fiberKey: el => el && Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')),
  findQuill() {
    const el = document.querySelector('.ql-editor'); if (!el) return null;
    try { const Q = window.Quill; if (Q?.find) { const q = Q.find(el.closest('.ql-container') || el); if (q?.insertText) return q; } } catch {}
    const k = this.fiberKey(el); if (!k) return null;
    let f = el[k];
    for (let i = 0; f && i < 120; i++, f = f.return) {
      const n = f.stateNode;
      if (n) {
        if (typeof n.getEditor === 'function') { try { const q = n.getEditor(); if (q?.insertText) return q; } catch {} }
        if (typeof n.getContents === 'function' && typeof n.insertText === 'function') return n;
      }
      let h = f.memoizedState;
      for (let j = 0; h && j < 40; j++, h = h.next) {
        const v = h.memoizedState;
        if (v && typeof v === 'object' && typeof v.getContents === 'function' && typeof v.insertText === 'function') return v;
      }
    }
    return null;
  },
  findProposal() {
    const el = document.querySelector('.ql-editor') || document.querySelector('textarea,[contenteditable="true"]');
    const k = el && this.fiberKey(el); if (!k) return null;
    const hit = v => (v && typeof v === 'object' && v.proposta && v.redacao) ? v : null;
    let f = el[k];
    for (let i = 0; f && i < 150; i++, f = f.return) {
      let h = f.memoizedState;
      for (let j = 0; h && j < 50; j++, h = h.next) { const r = hit(h.memoizedState); if (r) return this.sanitize(r); }
      const p = f.memoizedProps;
      if (p) for (const key in p) { const r = hit(p[key]); if (r) return this.sanitize(r); }
    }
    return null;
  },
  sanitize(v) {
    const p = v.proposta || {}, r = v.redacao || {};
    const clean = s => String(s || '').replace(/<[^>]*>/g, '').trim();
    return {
      idProposta: p.idProposta, uid: p.uIdProposta,
      tema: clean(p.descTema), genero: clean(p.descGenero), serie: clean(p.serieEtapa),
      min: p.minPalvra || 0, max: p.maxPalavra || 0,
      enunciado: clean(p.proposta).slice(0, 400),
      motivadores: (p.textoMotivacional || []).length,
      uidRedacao: r.uIdRedacao || '', titulo: clean(r.titulo)
    };
  }
};

/* ── 7. BRIDGE (textarea/input) ────────────────────────────── */
const Bridge = {
  set(el, v) {
    if (!el) return false;
    if (el.isContentEditable) { el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, v); return true; }
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, v) : el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
};

/* ── 8. DELTAFORGE ─────────────────────────────────────────── */
const DeltaForge = {
  toDelta(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    if (!lines.length || lines.every(l => !l.length)) return { ops: [{ insert: '\n' }] };
    const ops = lines.map((l, i) => ({ insert: i < lines.length - 1 ? l + '\n' : l }));
    if (!ops[ops.length - 1].insert.endsWith('\n')) ops[ops.length - 1].insert += '\n';
    return { ops };
  }
};

/* ── 9. QUILLBRIDGE ────────────────────────────────────────── */
const QuillBridge = {
  q: null, el: null, fallback: null,
  detect() {
    this.q = FiberLens.findQuill();
    this.el = document.querySelector('.ql-editor');
    if (!this.el) {
      this.fallback = [...document.querySelectorAll('textarea,[contenteditable="true"]')]
        .filter(e => e.offsetHeight > 80 && !e.disabled && !e.readOnly)
        .sort((a, b) => b.offsetHeight - a.offsetHeight)[0] || null;
    } else this.fallback = null;
    return this.kind();
  },
  kind() { return this.q ? 'quill' : this.el ? 'dom' : this.fallback ? (this.fallback.tagName === 'TEXTAREA' ? 'textarea' : 'editable') : 'none'; },
  node() { return this.el || this.fallback; },
  read() {
    if (this.q) return this.q.getText();
    const n = this.node(); if (!n) return '';
    if (n.classList?.contains('ql-editor')) return n.innerText;
    return n.isContentEditable ? n.innerText : n.value;
  },
  _domSet(text) {
    const n = this.el; if (!n) return false;
    n.focus();
    n.innerHTML = text.split('\n').map(l => `<p>${l ? Utils.esc(l) : '<br>'}</p>`).join('') || '<p><br></p>';
    n.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const sel = window.getSelection(); sel.selectAllChildren(n); sel.collapseToEnd();
    return true;
  },
  replaceAll(text) {
    if (this.q) { this.q.setContents(DeltaForge.toDelta(text), 'user');
      try { this.q.setSelection(Math.max(0, this.q.getLength() - 1), 0); } catch {}
      return true; }
    if (this.el) return this._domSet(text);
    if (this.fallback) return Bridge.set(this.fallback, text);
    return false;
  },
  insertAtCursor(text) {
    if (this.q) { const r = this.q.getSelection(true) || { index: Math.max(0, this.q.getLength() - 1) };
      this.q.insertText(r.index, text.replace(/\s+$/, ''), 'user'); return true; }
    if (this.el) { this.el.focus(); document.execCommand('insertText', false, text); return true; }
    if (this.fallback) { const n = this.fallback;
      if (n.isContentEditable) { n.focus(); document.execCommand('insertText', false, text); }
      else { const s = n.selectionStart ?? n.value.length; n.value = n.value.slice(0, s) + text + n.value.slice(n.selectionEnd ?? s);
        n.dispatchEvent(new Event('input', { bubbles: true })); }
      return true; }
    return false;
  },
  pasteNative(text) {
    const n = this.el; if (!n) return null;
    n.focus();
    const q = this.q, before = q ? q.getLength() : n.innerText.length;
    const sel = window.getSelection(); sel.selectAllChildren(n); sel.collapseToEnd();
    try {
      const dt = new DataTransfer(); dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      n.dispatchEvent(ev);
      const after = q ? q.getLength() : n.innerText.length;
      if (ev.defaultPrevented && after > before) return 'paste';
    } catch {}
    document.execCommand('insertText', false, text);
    return 'execCommand';
  }
};

/* ── 10. QUILLTYPER ────────────────────────────────────────── */
const QuillTyper = {
  running: false, _stop: false,
  stop() { this._stop = true; },
  tokens(text, grain) {
    if (grain === 'char') return [...String(text)];
    if (grain === 'phrase') return String(text).match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [text];
    return String(text).split(/(\s+)/).filter(t => t.length);
  },
  async run(text, opt, onProg) {
    const q = QuillBridge.q, n = QuillBridge.el;
    if (!q && !n) return false;
    this.running = true; this._stop = false;
    if (opt.mode === 'replace') { q ? q.setText('', 'user') : (n.focus(), n.innerHTML = '<p><br></p>'); }
    const tks = this.tokens(text, opt.grain);
    for (let i = 0; i < tks.length; i++) {
      if (this._stop) { this.running = false; return false; }
      const tk = tks[i];
      if (q) { const idx = Math.max(0, q.getLength() - 1); q.insertText(idx, tk, 'user');
        try { q.setSelection(idx + tk.length, 0); } catch {} }
      else { n.focus(); document.execCommand('insertText', false, tk); }
      onProg && onProg((i + 1) / tks.length);
      let d = opt.speed;
      if (opt.pausePunct) { const c = tk.trim().slice(-1);
        if (/[.!?]/.test(c)) d += opt.speed * 9; else if (/[,;:]/.test(c)) d += opt.speed * 3; }
      if (tk.includes('\n')) d += opt.speed * 5;
      await Utils.sleep(d * (0.7 + Math.random() * 0.6));
    }
    this.running = false; return true;
  }
};

/* ── 11. WORDGUARD ─────────────────────────────────────────── */
const WordGuard = {
  check(w, min, max) {
    if (max && w > max) return { level: 'err', msg: `Acima do máximo: ${w}/${max} palavras` };
    if (min && w < min) return { level: 'warn', msg: `Abaixo do mínimo: ${w}/${min} palavras` };
    return { level: 'ok', msg: 'Dentro dos limites da proposta' };
  },
  paint(words, min, max, goal) {
    const el = UI.$('[data-bar]'); if (!el) return;
    const target = max || goal || min || 500, pct = Math.min(100, Math.round(words / target * 100));
    el.style.width = pct + '%';
    el.style.background = (max && words > max) ? '#ef4444' : (min && words < min) ? '#f59e0b' : '#22c55e';
    const g = UI.$('[data-show="guard"]');
    if (g) g.textContent = `${words} palavras${min ? ` · mín ${min}` : ''}${max ? ` · máx ${max}` : ''}${goal ? ` · meta ${goal}` : ''} · ${pct}%`;
  }
};


/* ── EDITOR CORE: editor autônomo, timer de foco, progresso diário, metas e estatísticas ── */

const EditorCore = {
  _text: '',
  get() {
    const live = (() => { try { return EditorObject.getText(); } catch { return ''; } })();
    return live || this._text || '';
  },
  set(t) {
    this._text = String(t ?? '');
    try { EditorObject.setText(this._text); } catch {}
    try { EventBus.emit('editor:changed', { words: RsUtils.words(this._text) }); } catch {}
    return this._text;
  },
  insert(snippet) {
    const cur = this.get();
    return this.set(cur ? cur + '\n' + snippet : snippet);
  },
  clear() { return this.set(''); }
};

const FocusTimer = {
  running: false, start: 0, totalToday: 0,
  begin(minutes = 25) {
    if (this.running) return { ok: false, err: 'already_running' };
    this.running = true;
    this.start = Date.now();
    this.planned = minutes;
    this._iv = setInterval(() => { try { EventBus.emit('focus:tick', { elapsed: this.elapsed() }); } catch {} }, 1000);
    try { EventBus.emit('focus:started', { at: this.start, minutes }); } catch {}
    return { ok: true };
  },
  elapsed() { return this.running ? Date.now() - this.start : 0; },
  fmt(ms) {
    const s = Math.floor((ms || 0) / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  },
  stop(save = true) {
    if (!this.running) return { ok: false, err: 'not_running' };
    this.running = false;
    clearInterval(this._iv);
    const mins = Math.max(1, Math.round((Date.now() - this.start) / 60000));
    if (save) {
      try { RsStoreExt.trackWords(RsUtils.words(EditorCore.get()), mins); } catch {}
      try { EventBus.emit('focus:stopped', { mins }); } catch {}
    }
    return { ok: true, mins };
  }
};

const ProgressTracker = {
  log(words) {
    RsStoreExt.ensure();
    const k = RsUtils.todayKey();
    const e = RsStoreExt.getDaily(k);
    e.words = Math.max(e.words, words || 0);
    try { Store.save(); } catch {}
    return { key: k, entry: e };
  },
  week() {
    RsStoreExt.ensure();
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const k = RsUtils.todayKey(d);
      out.push({ key: k, ...(Store.data.daily[k] || { words: 0, sessions: 0, mins: 0, texts: 0 }) });
    }
    return out;
  },
  streak() {
    const w = this.week();
    let s = 0;
    for (let i = w.length - 1; i >= 0; i--) {
      if ((w[i].words || 0) > 0) s++;
      else if (i === w.length - 1) continue;
      else break;
    }
    return s;
  }
};

const GoalsManager = {
  get() { RsStoreExt.ensure(); return { ...Store.data.goals }; },
  set(patch) {
    RsStoreExt.ensure();
    Object.assign(Store.data.goals, patch || {});
    try { Store.save(); } catch {}
    return this.get();
  },
  status() {
    const g = this.get();
    const today = RsStoreExt.getDaily(RsUtils.todayKey());
    return {
      goals: g,
      today,
      dailyPct: g.dailyWords ? Math.min(100, Math.round(today.words / g.dailyWords * 100)) : 0,
      met: g.dailyWords ? today.words >= g.dailyWords : false
    };
  }
};

const StatsManager = {
  summarize(text) {
    const t = text ?? EditorCore.get();
    const words = RsUtils.words(t);
    const sentences = String(t).split(/[.!?…]+/).map(s => s.trim()).filter(Boolean);
    return {
      words, chars: String(t).length,
      sentences: sentences.length,
      avgWordsPerSentence: sentences.length ? Math.round(words / sentences.length) : 0,
      paragraphs: String(t).trim() ? String(t).trim().split(/\n\s*\n+/).length : 0,
      week: ProgressTracker.week(),
      streak: ProgressTracker.streak(),
      goals: GoalsManager.status()
    };
  }
};

ModuleRegistry.register('EditorCore', EditorCore, { kind: 'editor' });
ModuleRegistry.register('FocusTimer', FocusTimer, { kind: 'productivity' });
ModuleRegistry.register('ProgressTracker', ProgressTracker, { kind: 'productivity' });
ModuleRegistry.register('GoalsManager', GoalsManager, { kind: 'productivity' });
ModuleRegistry.register('StatsManager', StatsManager, { kind: 'productivity' });

/* ── 12. ANALYZER ──────────────────────────────────────────── */
const Analyzer = {
  STOP: new Set(('de a o e é um uma que do da dos das em no na nos nas para por com sem sob sobre entre ao aos à às '+
    'pelo pela pelos pelas isso isto não sim mais menos muito pouco como quando onde qual quais se já também então '+
    'até após antes durante mas porém contudo todavia entretanto pois porque seu sua seus suas meu minha meus minhas '+
    'ele ela eles elas nós você vocês eu tu lhe lhes me te nos os as este esta esse essa aquele aquela esses essas '+
    'há foi ser são era sendo ter tem tinha hoje dia ano vez vezes coisa coisas ainda assim bem quase só apenas tal '+
    'todo toda todos todas outro outra outros outras').split(' ')),
  CONNECTIVES: {
    'Oposição': ['mas','porém','contudo','todavia','entretanto','no entanto','embora','apesar de','ainda que'],
    'Adição': ['além disso','ademais','outrossim','igualmente','da mesma forma','no mesmo sentido'],
    'Causa/Consequência': ['porque','visto que','uma vez que','já que','por isso','consequentemente','de modo que','logo'],
    'Conclusão': ['portanto','assim','desse modo','dessa forma','em suma','em conclusão','por fim'],
    'Sequência': ['primeiramente','em primeiro lugar','em segundo lugar','em seguida','posteriormente','finalmente'],
    'Exemplificação': ['por exemplo','tal como','isto é','ou seja']
  },
  tokens(t) { return CountSync.strip(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; },
  sentences(t) { return (t.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || []).map(s => s.trim()).filter(Boolean); },
  stats(t) {
    const w = this.tokens(t), s = this.sentences(t), u = new Set(w);
    return {
      chars: CountSync.chars(t), words: w.length, unique: u.size,
      diversity: w.length ? Math.round(u.size / w.length * 100) : 0,
      sentences: s.length, avgSent: s.length ? Math.round(w.length / s.length) : 0,
      paragraphs: t.trim() ? t.trim().split(/\n\s*\n+/).filter(p => p.trim()).length : 0,
      readingMin: Math.ceil(w.length / 200), speakingMin: Math.ceil(w.length / 130)
    };
  },
  freq(t, n = 10) {
    const m = {};
    for (const w of this.tokens(t)) if (!this.STOP.has(w) && w.length > 2) m[w] = (m[w] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  },
  connectives(t) {
    const low = ' ' + CountSync.strip(t).toLowerCase() + ' ', out = {};
    for (const [cat, list] of Object.entries(this.CONNECTIVES))
      out[cat] = list.filter(c => low.includes(' ' + c + ' ') || low.includes(' ' + c + ',') || low.includes(' ' + c + '.'));
    return out;
  },
  longSentences(t, max = 45) { return this.sentences(t).filter(s => this.tokens(s).length > max); },
  repeats(t, win = 50) {
    const w = this.tokens(t), bad = new Set();
    for (let i = 0; i < w.length; i++) {
      if (this.STOP.has(w[i]) || w[i].length < 5) continue;
      for (let j = i + 1; j < Math.min(i + win, w.length); j++) if (w[j] === w[i]) { bad.add(w[i]); break; }
    }
    return [...bad].slice(0, 8);
  }
};

/* ── 13. FOCUS ─────────────────────────────────────────────── */
const Focus = {
  running: false, start: 0, _iv: null,
  toggle() { this.running ? this.stop(true) : this.begin(); },
  begin() { this.running = true; this.start = Date.now();
    this._iv = setInterval(() => UI.tickFocus(), 1000);
    Logger.info('⏱ Sessão de foco iniciada.'); },
  stop(save = true) {
    if (!this.running) return;
    this.running = false; clearInterval(this._iv);
    const mins = Math.max(1, Math.round((Date.now() - this.start) / 60000));
    if (save) {
      Store.data.sessions.unshift({ date: Date.now(), mins, words: CountSync.words(UI.$('.rs-editor')?.value || '') });
      Store.data.sessions = Store.data.sessions.slice(0, 30); Store.save();
      Logger.ok(`⏱ Sessão salva: ${mins} min.`);
    }
    UI.tickFocus(); if (UI.tab === 'focus') UI.renderFocus();
  },
  reset() { this.stop(false); Logger.info('Sessão descartada.'); },
  elapsed() { return this.running ? Date.now() - this.start : 0; },
  fmt(ms) { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); },
  totalMins() { return (Store.data.sessions || []).reduce((a, s) => a + s.mins, 0); }
};

/* ── 14. SNAP ──────────────────────────────────────────────── */
const Snap = {
  _last: '',
  init() { setInterval(() => this.maybe(), 30000); },
  maybe() {
    const ev = +Store.data.settings.snapEvery || 0; if (!ev) return;
    const ed = UI.$('.rs-editor'); if (!ed) return;
    const t = ed.value;
    if (!t.trim() || t === this._last) return;
    this._last = t;
    const last = Store.data.snapshots[0];
    if (last && Date.now() - last.date < ev * 60000) return;
    Store.data.snapshots.unshift({ date: Date.now(), words: CountSync.words(t), text: t.slice(0, 20000) });
    Store.data.snapshots = Store.data.snapshots.slice(0, 15); Store.save();
    if (UI.tab === 'drafts') UI.renderDrafts();
  },
  force() {
    const t = UI.$('.rs-editor')?.value || '';
    if (!t.trim()) { Logger.info('Nada para capturar.'); return; }
    Store.data.snapshots.unshift({ date: Date.now(), words: CountSync.words(t), text: t });
    Store.data.snapshots = Store.data.snapshots.slice(0, 15); Store.save(); this._last = t;
    UI.renderDrafts(); Logger.ok('📸 Snapshot capturado.');
  }
};


/* ── MOTOR DE ANÁLISE: sílabas (heurística pt-BR), legibilidade, esquema de resultado, abas ── */

const SyllableCounter = {
  // Heurística: conta grupos vocálicos, ajusta ditongos nasais e 'qu/gu'.
  countWord(w) {
    let s = String(w || '').toLowerCase().normalize('NFC').replace(/[^a-zà-úüç]/g, '');
    if (!s) return 0;
    if (s.length <= 3) return 1;
    s = s.replace(/qu/g, 'q').replace(/gu([ei])/g, 'g$1');
    const groups = s.match(/[aeiouáéíóúâêôãõàü]+/g) || [];
    let n = groups.length;
    if (/ns$/.test(s) && n > 1) n -= 0; // nasal final mantém
    return Math.max(1, n);
  },
  countText(t) {
    const words = String(t || '').toLowerCase().match(/[\p{L}]+/gu) || [];
    return { words: words.length, syllables: words.reduce((a, w) => a + this.countWord(w), 0) };
  }
};

const ReadabilityAnalyzer = {
  fleschPt(words, sentences, syllables) {
    if (!words || !sentences) return 0;
    const wps = words / sentences;
    const spw = syllables / words;
    // Adaptação Flesch para pt-BR (Fernández-Huerta simplificada)
    const score = 248.835 - 1.015 * wps - 84.6 * spw;
    return Math.max(0, Math.min(100, Math.round(score)));
  },
  grade(score) {
    if (score >= 75) return { label: 'Muito fácil', level: 'ok' };
    if (score >= 50) return { label: 'Fácil / adequado', level: 'ok' };
    if (score >= 25) return { label: 'Difícil', level: 'warn' };
    return { label: 'Muito difícil', level: 'err' };
  },
  analyze(text) {
    const { words, syllables } = SyllableCounter.countText(text);
    const sentences = String(text).split(/[.!?…]+/).map(s => s.trim()).filter(Boolean).length || 1;
    const score = this.fleschPt(words, sentences, syllables);
    return { words, sentences, syllables, fleschPt: score, ...this.grade(score) };
  }
};

const TextEngine = {
  analyze(text) {
    const t = String(text ?? EditorCore.get());
    const base = (() => { try { return Analyzer.stats(t); } catch { return StatsManager.summarize(t); } })();
    const read = ReadabilityAnalyzer.analyze(t);
    const lexical = (() => { try { return LexicalAnalyzer.analyze(t); } catch { return null; } })();
    const style = (() => { try { return StyleAnalyzer.analyze(t); } catch { return null; } })();
    const vices = (() => { try { return VicesCatalog.scan(t); } catch { return []; } })();
    return { ...base, readability: read, lexical, style, vices };
  }
};

const ResultSchema = {
  version: 'rs-result/1.0',
  build(text) {
    const a = TextEngine.analyze(text);
    return {
      schema: this.version,
      at: new Date().toISOString(),
      metrics: {
        words: a.words, sentences: a.sentences, paragraphs: a.paragraphs,
        chars: a.chars, diversity: a.diversity ?? null, avgSent: a.avgSent ?? a.avgWordsPerSentence
      },
      readability: a.readability,
      lexical: a.lexical,
      style: a.style,
      vices: a.vices,
      notes: []
    };
  }
};

const AnalysisTabs = {
  // Organização das abas de análise (usada pela UI ou pelo console).
  tabs: [
    { id: 'overview', title: 'Visão geral', hint: 'Métricas, legibilidade e progresso' },
    { id: 'style', title: 'Estilo', hint: 'Voz passiva, advérbios, frases longas' },
    { id: 'lexicon', title: 'Léxico', hint: 'Diversidade, repetições, sinônimos' },
    { id: 'vices', title: 'Vícios', hint: 'Clichês e expressões a evitar' },
    { id: 'readability', title: 'Legibilidade', hint: 'Flesch-pt e sílabas' },
    { id: 'repertoire', title: 'Repertório', hint: 'Leis, pensadores, obras e dados' }
  ],
  list() { return this.tabs.map(t => ({ ...t })); }
};

ModuleRegistry.register('SyllableCounter', SyllableCounter, { kind: 'analysis' });
ModuleRegistry.register('ReadabilityAnalyzer', ReadabilityAnalyzer, { kind: 'analysis' });
ModuleRegistry.register('TextEngine', TextEngine, { kind: 'analysis' });
ModuleRegistry.register('ResultSchema', ResultSchema, { kind: 'analysis' });
ModuleRegistry.register('AnalysisTabs', AnalysisTabs, { kind: 'interface' });

/* ── ANÁLISE ESTILÍSTICA/LÉXICA, VÍCIOS, SINÔNIMOS, CONFUSÕES GRAMATICAIS ── */

const LexicalAnalyzer = {
  analyze(text, topN = 10) {
    const tokens = String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const uniq = new Set(tokens);
    const freq = (() => { try { return Analyzer.freq(text, topN); } catch { return []; } })();
    const repeats = (() => { try { return Analyzer.repeats(text); } catch { return []; } })();
    return {
      total: tokens.length,
      unique: uniq.size,
      diversity: tokens.length ? Math.round(uniq.size / tokens.length * 100) : 0,
      top: freq, repeats
    };
  }
};

const StyleAnalyzer = {
  analyze(text) {
    const t = String(text || '');
    const sentences = t.split(/[.!?…]+/).map(s => s.trim()).filter(Boolean);
    const long = sentences.filter(s => s.split(/\s+/).length > 35);
    const passive = (t.match(/\b(foi|foram|é|são|era|eram|será|serão)\s+\w+(ado|ido|ada|ida|ados|idos)\b/gi) || []).length;
    const adverbs = (t.match(/\b\w+mente\b/gi) || []).length;
    const firstPerson = (t.match(/\b(eu|meu|minha|acho que|na minha opinião)\b/gi) || []).length;
    const score = RsUtils.clamp(100 - long.length * 8 - passive * 3 - Math.max(0, adverbs - 3) * 4 - firstPerson * 5, 0, 100);
    return {
      sentences: sentences.length, longSentences: long.length,
      passive, adverbs, firstPerson, score, level: RsUtils.levelOf(score),
      tips: [
        long.length ? `Quebre ${long.length} frase(s) com +35 palavras.` : null,
        passive > 2 ? 'Prefira voz ativa (ex.: "o Estado garante" em vez de "é garantido").' : null,
        adverbs > 5 ? 'Reduza advérbios em -mente; use verbos fortes.' : null,
        firstPerson ? 'Em dissertação formal, evite 1ª pessoa; use impessoalidade.' : null
      ].filter(Boolean)
    };
  }
};

const VicesCatalog = {
  // catálogo: expressão → sugestão
  items: [
    { re: /\bna minha (humilde )?opinião\b/i, fix: 'remova; o texto já é sua opinião' },
    { re: /\bacho que\b/i, fix: 'use afirmação impessoal: "evidencia-se que"' },
    { re: /\bde uma forma (geral )?ou (de )?outra\b/i, fix: 'seja específico' },
    { re: /\bmuito (bom|ruim|grande|importante)\b/i, fix: 'quantifique ou use termo preciso' },
    { re: /\bcoisas?\b/i, fix: 'nomeie: fatores, medidas, dados' },
    { re: /\bfazer (um|uma) (reflexão|análise)\b/i, fix: '"refletir sobre" / "analisar"' },
    { re: /\b(a nível de|através de)\b/i, fix: 'clichê; prefira "em", "por meio de" com parcimônia' },
    { re: /\bgerundismo: (estar|ir|vai estar)\s+\w+ndo\b/i, fix: 'evite gerundismo' },
    { re: /[!]{2,}|\?{2,}/, fix: 'texto formal usa uma pontuação por frase' },
    { re: /\b(tipo assim|né|aí|tá)\b/i, fix: 'marcas de oralidade — remover' },
    { re: /\bcom certeza absoluta\b/i, fix: 'pleonasmo; use "certamente"' },
    { re: /\belo (de ligação|perdido)\b/i, fix: 'conectivo vago; use articulador preciso' }
  ],
  norm(s) { try { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { return String(s || '').toLowerCase(); } },
  scan(text) {
    const out = [];
    const ascii = this.norm(text);
    for (const it of this.items) {
      it.re.lastIndex = 0;
      let hit = it.re.test(text);
      if (!hit) {
        try {
          const src = String(it.re.source).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const rx = new RegExp(src, it.re.flags);
          hit = rx.test(ascii);
        } catch {}
      }
      if (hit) out.push({ pattern: String(it.re), fix: it.fix });
      it.re.lastIndex = 0;
    }
    return out;
  }
};

const AvoidExpressions = {
  list: [
    'na minha humilde opinião', 'acho que', 'tipo assim', 'né', 'coisa',
    'fazer uma reflexão', 'a nível de', 'através de (excesso)',
    'com certeza absoluta', 'elo de ligação', 'muito bom/muito ruim (vago)'
  ],
  check(text) {
    const low = String(text || '').toLowerCase();
    return this.list.filter(e => low.includes(e.split(' ')[0]) && low.includes(e.slice(0, 8)));
  }
};

const SynonymsBank = {
  // banco enxuto e seguro para variar o texto sem mudar o sentido formal
  data: {
    'importante': ['relevante', 'pertinente', 'substancial', 'crucial'],
    'problema': ['impasse', 'entrave', 'questão', 'desafio'],
    'mostrar': ['evidenciar', 'demonstrar', 'revelar', 'denotar'],
    'melhorar': ['aprimorar', 'aperfeiçoar', 'otimizar'],
    'pessoas': ['indivíduos', 'cidadãos', 'população'],
    'governo': ['Estado', 'poder público', 'administração pública'],
    'dinheiro': ['recursos', 'verbas', 'financiamento'],
    'lugar': ['espaço', 'local', 'território'],
    'grande': ['amplo', 'vasto', 'expressivo'],
    'pequeno': ['restrito', 'limitado', 'reduzido'],
    'aumentar': ['ampliar', 'elevar', 'expandir'],
    'diminuir': ['reduzir', 'atenuar', 'mitigar'],
    'usar': ['utilizar', 'empregar', 'adotar'],
    'fazer': ['realizar', 'executar', 'promover', 'implementar'],
    'começar': ['iniciar', 'dar início a'],
    'terminar': ['concluir', 'encerrar'],
    'ideia': ['concepção', 'noção', 'perspectiva'],
    'atual': ['contemporâneo', 'vigente', 'presente'],
    'sociedade': ['corpo social', 'coletividade'],
    'desigualdade': ['assimetria', 'disparidade', 'iniquidade']
  },
  suggest(word) {
    const k = String(word || '').toLowerCase();
    return this.data[k] || [];
  }
};

const GrammarConfusions = {
  entries: [
    { pair: 'mas × mais', rule: '"mas" opõe; "mais" soma/intensifica. Ex.: "quero, mas não posso" × "quero mais".' },
    { pair: 'mal × mau', rule: '"mal" é advérbio (bem/mal); "mau" é adjetivo (bom/mau). Ex.: "mal-estar" × "mau comportamento".' },
    { pair: 'onde × aonde', rule: '"onde" lugar fixo; "aonde" movimento. Ex.: "onde mora" × "aonde vai".' },
    { pair: 'por que/porque/porquê', rule: 'pergunta+resposta: "por que" pergunta; "porque" explica; "o porquê" substantivo.' },
    { pair: 'há × a', rule: 'tempo passado usa "há" (haver). Ex.: "há dois anos". Futuro/distância usa "a".' },
    { pair: 'afim × a fim', rule: '"afim" afinidade; "a fim de" finalidade. Ex.: "estudar a fim de passar".' },
    { pair: 'senão × se não', rule: '"senão" = caso contrário; "se não" = condição. Ex.: "estude, senão reprova".' },
    { pair: 'mim × eu', rule: 'após preposição usa "mim" (para mim fazer — errado; "para eu fazer" — certo).' },
    { pair: 'ao invés × em vez', rule: '"em vez de" = substituição; "ao invés" = oposição. Na dúvida, use "em vez de".' },
    { pair: 'entre eu e você', rule: 'após preposição: "entre mim e você".' }
  ],
  find(text) {
    const low = ' ' + String(text || '').toLowerCase() + ' ';
    const hits = [];
    if (/\bmais\b.*\bmas\b|\bmas\b.*\bmais\b/.test(low)) hits.push(this.entries[0]);
    if (/\bmal\b|\bmau\b/.test(low)) hits.push(this.entries[1]);
    if (/\baonde\b/.test(low)) hits.push(this.entries[2]);
    return hits;
  }
};

const ConnectivesBank = {
  groups: {
    'Oposição': ['mas', 'porém', 'contudo', 'todavia', 'entretanto', 'no entanto', 'embora'],
    'Adição': ['além disso', 'ademais', 'outrossim', 'bem como'],
    'Causa': ['pois', 'porque', 'visto que', 'uma vez que', 'dado que'],
    'Consequência': ['por isso', 'logo', 'consequentemente', 'desse modo'],
    'Conclusão': ['portanto', 'assim', 'em suma', 'dessa forma', 'por fim'],
    'Exemplo': ['por exemplo', 'tal como', 'isto é', 'ou seja']
  }
};

ModuleRegistry.register('LexicalAnalyzer', LexicalAnalyzer, { kind: 'analysis' });
ModuleRegistry.register('StyleAnalyzer', StyleAnalyzer, { kind: 'analysis' });
ModuleRegistry.register('VicesCatalog', VicesCatalog, { kind: 'analysis' });
ModuleRegistry.register('AvoidExpressions', AvoidExpressions, { kind: 'analysis' });
ModuleRegistry.register('SynonymsBank', SynonymsBank, { kind: 'lexicon' });
ModuleRegistry.register('GrammarConfusions', GrammarConfusions, { kind: 'lexicon' });
ModuleRegistry.register('ConnectivesBank', ConnectivesBank, { kind: 'lexicon' });

/* ── ESCRITA: esqueletos, intervenção (ENEM), competências e treino ── */

const SkeletonGenerator = {
  models: {
    dissertativo: [
      'Introdução: contextualize o tema + tese + 2 argumentos (um por parágrafo).',
      'Desenvolvimento 1: argumento 1 + repertório + análise.',
      'Desenvolvimento 2: argumento 2 + repertório + análise.',
      'Conclusão: retomada da tese + proposta de intervenção (agente+ação+meio+finalidade).'
    ],
    enem: [
      'Introdução (5-7 linhas): repertório de abertura + problematização + tese.',
      'D1: causa ou argumento 1 com dado/lei/pensador.',
      'D2: consequência ou argumento 2 com filme/obra/documento.',
      'Conclusão: síntese + intervenção completa com os 5 elementos + detalhamento.'
    ],
    opiniao: ['Tese clara no 1º parágrafo.', '2 argumentos com exemplos.', 'Contra-argumento + refutação.', 'Fechamento com recomendação.']
  },
  generate(model = 'enem', theme = 'tema da redação') {
    const steps = this.models[model] || this.models.enem;
    return [`Tema: ${theme}`, '', ...steps.map((s, i) => `${i + 1}. ${s}`)].join('\n');
  }
};

const InterventionBuilder = {
  fields: ['agente', 'acao', 'meio', 'finalidade', 'detalhamento'],
  build({ agente = '', acao = '', meio = '', finalidade = '', detalhamento = '' } = {}) {
    const missing = this.fields.filter(f => !({ agente, acao, meio, finalidade, detalhamento })[f]?.trim());
    const text = `Portanto, ${agente || '[AGENTE]'} deve ${acao || '[AÇÃO]'}, por meio de ${meio || '[MEIO]'}, a fim de ${finalidade || '[FINALIDADE]'}.${detalhamento ? ' ' + detalhamento : ''}`;
    return { text, missing, complete: missing.length === 0 };
  },
  template() { return 'Portanto, [AGENTE] deve [AÇÃO], por meio de [MEIO], a fim de [FINALIDADE]. [DETALHAMENTO + exemplo].'; }
};

const CompetenceChecklist = {
  items: [
    { id: 'c1', title: 'C1 — Norma culta', hint: 'Ortografia, concordância, regência e pontuação.' },
    { id: 'c2', title: 'C2 — Tema e tipologia', hint: 'Não fugir do tema nem do dissertativo-argumentativo.' },
    { id: 'c3', title: 'C3 — Argumentação', hint: 'Projeto de texto, autoria e repertório produtivo.' },
    { id: 'c4', title: 'C4 — Coesão', hint: 'Conectivos, retomadas e progressão sem repetições.' },
    { id: 'c5', title: 'C5 — Intervenção', hint: 'Agente+ação+meio+finalidade+detalhamento, respeitando direitos humanos.' }
  ],
  get() {
    RsStoreExt.ensure();
    Store.data.checklist = Store.data.checklist || {};
    return this.items.map(it => ({ ...it, done: !!Store.data.checklist[it.id] }));
  },
  toggle(id) {
    RsStoreExt.ensure();
    Store.data.checklist[id] = !Store.data.checklist[id];
    try { Store.save(); } catch {}
    return this.get();
  }
};

const CompetenceScorer = {
  score(text, checklistState) {
    const t = String(text || '');
    const style = (() => { try { return StyleAnalyzer.analyze(t); } catch { return { score: 60 }; } })();
    const lex = (() => { try { return LexicalAnalyzer.analyze(t); } catch { return { diversity: 50 }; } })();
    const vices = (() => { try { return VicesCatalog.scan(t).length; } catch { return 0; } })();
    const done = (checklistState || []).filter(c => c.done).length;
    const c1 = RsUtils.clamp(200 - vices * 20 - (style.passive || 0) * 5, 0, 200);
    const c2 = t.trim() ? 160 : 0;
    const c3 = RsUtils.clamp(80 + (lex.diversity || 0) * 1.2, 0, 200);
    const c4 = RsUtils.clamp((style.score || 60) * 2, 0, 200);
    const c5 = done >= 5 ? 200 : done * 40;
    const total = Math.round(c1 + c2 + c3 + c4 + c5);
    return { c1: Math.round(c1), c2, c3: Math.round(c3), c4: Math.round(c4), c5, total, max: 1000 };
  }
};

const TrainingDrills = {
  drills: [
    { id: 'tese-10min', title: 'Tese em 10 min', task: 'Escreva 1 tese + 2 argumentos para o tema do dia.' },
    { id: 'conectivos', title: 'Conectivos', task: 'Reescreva 1 parágrafo usando 3 conectivos diferentes.' },
    { id: 'repertorio', title: 'Repertório produtivo', task: 'Explique 1 repertório com 2 frases ligadas à tese (sem resumo da obra).' },
    { id: 'intervencao', title: 'Intervenção completa', task: 'Monte 1 proposta com os 5 elementos em 5 linhas.' },
    { id: 'reescrita', title: 'Reescrita sem vícios', task: 'Reescreva 1 parágrafo removendo clichês e oralidades.' }
  ],
  pick() { return this.drills[Math.floor(Math.random() * this.drills.length)]; }
};

ModuleRegistry.register('SkeletonGenerator', SkeletonGenerator, { kind: 'writing' });
ModuleRegistry.register('InterventionBuilder', InterventionBuilder, { kind: 'writing' });
ModuleRegistry.register('CompetenceChecklist', CompetenceChecklist, { kind: 'writing' });
ModuleRegistry.register('CompetenceScorer', CompetenceScorer, { kind: 'writing' });
ModuleRegistry.register('TrainingDrills', TrainingDrills, { kind: 'training' });

/* ── 15. SPY (postMessage / Unity) ─────────────────────────── */
const Spy = {
  events: [], enabled: true, _origPostMessage: null,
  install() {
    this._origPostMessage = window.postMessage.bind(window);
    window.postMessage = function (data, ...rest) {
      if (Spy.enabled) {
        try {
          const p = Utils.parseMaybeJson(data);
          const type = p?.type || p?.Type;
          if (type) Spy.record('OUT→', type, p, 'postMessage');
        } catch {}
      }
      return Spy._origPostMessage(data, ...rest);
    };
    window.addEventListener('message', (e) => {
      if (!Spy.enabled) return;
      try {
        const data = Utils.parseMaybeJson(e.data);
        if (data && typeof data === 'object' && !data.__rsSpy) {
          const type = data.type || data.Type;
          if (type) Spy.record('IN←', type, data, 'message');
        }
      } catch {}
    }, true);
    const iv = setInterval(() => {
      const mod = window.unityInstance?.Module;
      if (mod?.SendMessage && !mod.__rsHooked) {
        const orig = mod.SendMessage.bind(mod);
        mod.SendMessage = function (go, method, param) {
          if (Spy.enabled) Spy.record('UNITY→', `${go}.${method}`, param, 'Unity');
          return orig(go, method, param);
        };
        mod.__rsHooked = true;
        clearInterval(iv);
      }
    }, 1000);
    setTimeout(() => clearInterval(iv), 60000);
  },
  record(dir, type, payload, via) {
    const evt = { t: Utils.time(), dir, type, payload, via };
    this.events.push(evt);
    if (this.events.length > CFG.maxEvents) this.events.shift();
    try { UI.appendEvent(evt); } catch {}
  },
  clear() { this.events = []; UI.$('#rs-events')?.replaceChildren(); UI.updateSpyCount(); },
  export() { return Utils.safeJson(this.events, 2); }
};

/* ── 16. URL CAPTURE ───────────────────────────────────────── */
const URLCapture = {
  captured: [], _installed: false,
  install() {
    if (this._installed) return;
    this._installed = true;
    const origFetch = window.fetch;
    window.fetch = function (resource, options) {
      try {
        const url = typeof resource === 'string' ? resource : (resource?.url || String(resource)) || '';
        URLCapture._record(url, options?.method || 'GET', 'fetch');
      } catch {}
      return origFetch.apply(this, arguments);
    };
    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    OrigXHR.prototype.open = function (method, url) {
      try { URLCapture._record(String(url || ''), method || 'GET', 'xhr'); } catch {}
      return origOpen.apply(this, arguments);
    };
  },
  _record(url, method, via) {
    if (!url) return;
    const patterns = [
      /^(https?:\/\/[^\/]*(?:scoringservice|scoring-service|scoring)[^\/]*\/)/i,
      /^(https?:\/\/[^\/]*matific[^\/]*\/[^\/]*(?:facts?|addFacts))/i
    ];
    for (const rx of patterns) {
      const m = url.match(rx);
      if (m) {
        this.captured.push({ url, method, via, ts: Date.now() });
        if (!SpawnFinish.detectedBaseUrl) {
          SpawnFinish.detectedBaseUrl = m[1];
          Logger.ok(`🎯 Scoring URL capturada: ${SpawnFinish.detectedBaseUrl}`);
          try { UI._refreshSpawnUI(); } catch {}
        }
        return;
      }
    }
    if (/addFacts|add_facts|add-facts/i.test(url)) {
      const base = url.replace(/\/addFacts.*$/i, '/');
      this.captured.push({ url, method, via, ts: Date.now() });
      if (!SpawnFinish.detectedBaseUrl) {
        SpawnFinish.detectedBaseUrl = base;
        Logger.ok(`🎯 Scoring URL (fallback): ${base}`);
        try { UI._refreshSpawnUI(); } catch {}
      }
    }
  },
  scanPerformance() {
    try {
      const entries = performance.getEntriesByType('resource') || [];
      for (const e of entries) {
        if (/scoringservice|addFacts/i.test(e.name)) {
          const m = e.name.match(/^(https?:\/\/[^\/]+)/);
          if (m && !SpawnFinish.detectedBaseUrl) {
            SpawnFinish.detectedBaseUrl = m[1] + '/';
            Logger.ok(`🎯 Scoring URL via performance: ${SpawnFinish.detectedBaseUrl}`);
          }
        }
      }
    } catch {}
  }
};

/* ── 17. MSG ───────────────────────────────────────────────── */
const Msg = {
  base: (type, extra = {}) => ({ type, originId: Utils.genId(), messageId: Utils.genId(), ...extra }),
  finishEpisode: (stars = 5, score = null) => {
    const s = score != null ? score : (CFG.starScoreMap[stars] ?? 2500);
    return Msg.base('FinishEpisode', {
      stars, score: s, problemCount: 0,
      episodeSessionId: Utils.genId(20), episodeName: 'SpawnFinish',
      episodeVersion: '1.0.0', sinceStart: 1000,
      isArena: false, eventType: 'FinishEpisode'
    });
  },
  finishEpisodeApp: (stars = 5, score = null) => {
    const s = score != null ? score : (CFG.starScoreMap[stars] ?? 2500);
    return { Type: 'FinishEpisode', Stars: stars, Score: s, IsMuted: false, IsFavourite: false };
  },
  abortEpisode: () => Msg.base('AbortEpisode', {
    problemCount: 0, episodeSessionId: Utils.genId(20), sinceStart: 1000,
    episodeName: 'ForcedAbort', episodeVersion: '1.0.0', isArena: false, eventType: 'AbortEpisode'
  }),
  abortEpisodeApp: (reason = 'UserAbort') => ({ Type: 'AbortEpisode', AbortReason: reason, IsMuted: false, IsFavourite: false }),
  episodeReady: () => ({ Type: 'EpisodeReady' }),
  executeCommand: (cmds) => Msg.base('ExecuteCommand', { commands: cmds }),
  muteAudio: (mute) => Msg.executeCommand([{ class: 'InvokeServiceMethodCommand', id: Utils.genId(), parameters: { serviceName: 'AudioManager', methodName: mute ? 'mute' : 'unmute' } }]),
  startSuspended: (storedData = null) => Msg.base('StartSuspendedEpisode', { invocationAttributes: {}, storedData, setupCommands: null, episodePayload: {} }),
  tracking: (eventType, data = {}) => Msg.base('Tracking', { data: { ...data, type: eventType, eventType, sinceStart: 1000, isArena: false } }),
  ready: (extra = {}) => Msg.base('EpisodeReady', { infraVersion: '2.59', isMultiplayer: false, supportsSuspendAtStart: false, ...extra }),
  firstInteraction: () => Msg.base('FirstInteractionInProblemOccurred')
};

/* ── 18. IFRAME BRIDGE ─────────────────────────────────────── */
const IframeBridge = {
  _sent: [],
  _unityChannels() {
    const ch = [];
    if (window.unityInstance?.Module?.SendMessage) ch.push({ name: 'unityInstance.Module', send: s => window.unityInstance.Module.SendMessage('Firebase_JS', 'OnJsCallback', s) });
    if (window.Unity?.call) ch.push({ name: 'window.Unity', send: s => window.Unity.call(s) });
    ch.push({ name: 'self.pm', send: s => window.postMessage(s, '*') });
    if (window.parent !== window) ch.push({ name: 'parent.pm', send: s => window.parent.postMessage(s, '*') });
    return ch;
  },
  _allIframes() {
    const list = [];
    const walk = (doc, depth = 0) => {
      if (depth > 3) return;
      try {
        doc.querySelectorAll('iframe').forEach(f => {
          list.push({ el: f, src: f.src || '', id: f.id || '', name: f.name || '' });
          try { if (f.contentDocument) walk(f.contentDocument, depth + 1); } catch {}
        });
      } catch {}
    };
    walk(document);
    const classify = f => {
      const s = (f.src + ' ' + f.id + ' ' + f.name).toLowerCase();
      if (s.includes('episode-container')) return 'container';
      if (s.includes('content/episodes') || s.includes('static1.matific.com/content')) return 'episode';
      if (s.includes('episode')) return 'episode';
      return null;
    };
    return list.map(f => ({ ...f, kind: classify(f) })).filter(f => f.kind);
  },
  sendToApp(msg) {
    const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
    const results = [];
    for (const ch of this._unityChannels()) {
      try { ch.send(str); results.push({ ch: ch.name, ok: true }); }
      catch (e) { results.push({ ch: ch.name, ok: false, err: e.message }); }
    }
    this._sent.push({ t: Utils.time(), to: 'app', str });
    if (this._sent.length > 200) this._sent.shift();
    return results;
  },
  sendToEpisode(msg) {
    const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
    const iframes = this._allIframes();
    const results = [];
    for (const f of iframes) {
      try { f.el.contentWindow.postMessage(str, '*'); results.push({ iframe: f.kind, ok: true }); }
      catch (e) { results.push({ iframe: f.kind, ok: false, err: e.message }); }
    }
    this._sent.push({ t: Utils.time(), to: 'iframe', str });
    if (this._sent.length > 200) this._sent.shift();
    return results;
  },
  broadcast(msg) { return { app: this.sendToApp(msg), episodes: this.sendToEpisode(msg) }; },
  scan() {
    return {
      channels: this._unityChannels().map(c => c.name),
      iframes: this._allIframes().map(f => ({ kind: f.kind, src: Utils.truncate(f.src, 80) })),
      unityInstance: !!window.unityInstance
    };
  },
  injectIntoIframe(code, kind = null) {
    const iframes = this._allIframes().filter(f => !kind || f.kind === kind);
    const results = [];
    for (const f of iframes) {
      try {
        const script = f.el.contentWindow.document.createElement('script');
        script.textContent = code;
        f.el.contentWindow.document.head.appendChild(script);
        script.remove();
        results.push({ iframe: f.kind, ok: true });
      } catch (e) { results.push({ iframe: f.kind, ok: false, err: e.message }); }
    }
    return results;
  }
};


/* ── EXPORTAÇÃO: PDF via DOM em iframe (sem innerHTML), Markdown, rascunhos/snapshots ── */

const DomText = {
  el(tag, text = '', attrs = {}) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    return n;
  }
};

const MarkdownExporter = {
  report(result) {
    const L = [];
    L.push('# Relatório — Redação Studio');
    L.push('');
    L.push(`- Data: ${new Date().toLocaleString('pt-BR')}`);
    L.push(`- Palavras: ${result?.metrics?.words ?? '?'} | Frases: ${result?.metrics?.sentences ?? '?'}`);
    if (result?.readability) L.push(`- Legibilidade (Flesch-pt): ${result.readability.fleschPt} — ${result.readability.label}`);
    if (result?.lexical) L.push(`- Diversidade léxica: ${result.lexical.diversity}%`);
    if (result?.style) L.push(`- Estilo: ${result.style.score}/100 (${result.style.level})`);
    if (result?.vices?.length) {
      L.push('', '## Vícios detectados');
      result.vices.forEach(v => L.push(`- ${v.pattern} → ${v.fix}`));
    }
    if (result?.style?.tips?.length) {
      L.push('', '## Sugestões');
      result.style.tips.forEach(t => L.push(`- ${t}`));
    }
    L.push('', '---', '_Gerado localmente no Redação Studio._');
    return L.join('\n');
  },
  download(result, name = 'relatorio.md') {
    try { Utils.download(name, this.report(result), 'text/markdown'); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message }; }
  }
};

const PdfExporter = {
  // Constrói documento só com DOM (createElement/textContent). Sem innerHTML.
  buildDoc(frameDoc, title, paragraphs, result) {
    const style = DomText.el('style', 'body{font-family:Georgia,serif;margin:40px;color:#111}h1{font-size:20px}p{line-height:1.6;font-size:13px}.meta{color:#555;font-size:11px}');
    frameDoc.head.appendChild(style);
    const h = DomText.el('h1', title || 'Redação — Redação Studio');
    frameDoc.body.appendChild(h);
    const meta = DomText.el('div', `${new Date().toLocaleString('pt-BR')} · ${RsUtils.words(paragraphs.join('\n'))} palavras`, { class: 'meta' });
    frameDoc.body.appendChild(meta);
    paragraphs.forEach(p => frameDoc.body.appendChild(DomText.el('p', p)));
    if (result) {
      frameDoc.body.appendChild(DomText.el('hr'));
      frameDoc.body.appendChild(DomText.el('p', `Legibilidade: ${result.readability?.fleschPt ?? '?'} — ${result.readability?.label ?? ''}`));
    }
  },
  export(text, opts = {}) {
    const paras = String(text ?? EditorCore.get()).split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (!paras.length) return { ok: false, err: 'empty' };
    const result = opts.result || null;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const cleanup = () => setTimeout(() => frame.remove(), 2000);
    try {
      const doc = frame.contentDocument;
      doc.open(); doc.close();
      this.buildDoc(doc, opts.title, paras, result);
      setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch {} cleanup(); }, 300);
      return { ok: true };
    } catch (e) { cleanup(); return { ok: false, err: e.message }; }
  }
};

const DraftExporter = {
  exportAll() {
    RsStoreExt.ensure();
    try { Utils.download('rascunhos.json', Utils.safeJson(Store.data.drafts || []), 'application/json'); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message }; }
  }
};

const SnapshotManager = {
  list() { RsStoreExt.ensure(); return Store.data.snapshots || []; },
  exportAll() {
    try { Utils.download('snapshots.json', Utils.safeJson(this.list()), 'application/json'); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message }; }
  }
};

const ReportMarkdown = MarkdownExporter;

const ReportPdfData = {
  build(text) {
    const result = ResultSchema.build(text);
    return { result, markdown: MarkdownExporter.report(result) };
  }
};

const ResultCards = {
  // Cartões: {title, value, bar (0-100), note, level}
  build(text) {
    const r = ResultSchema.build(text);
    const cards = [
      { title: 'Palavras', value: String(r.metrics.words), bar: Math.min(100, Math.round(r.metrics.words / 500 * 100)), note: 'Meta comum: 250–500', level: r.metrics.words >= 200 ? 'ok' : 'warn' },
      { title: 'Legibilidade', value: `${r.readability.fleschPt} — ${r.readability.label}`, bar: r.readability.fleschPt, note: 'Alvo: 50–75', level: r.readability.level },
      { title: 'Diversidade léxica', value: `${r.lexical?.diversity ?? '?'}%`, bar: r.lexical?.diversity ?? 0, note: 'Evite repetições próximas', level: RsUtils.levelOf(r.lexical?.diversity ?? 0) },
      { title: 'Estilo', value: `${r.style?.score ?? '?'}/100`, bar: r.style?.score ?? 0, note: (r.style?.tips?.[0]) || 'Texto enxuto', level: r.style?.level || 'warn' },
      { title: 'Vícios', value: String(r.vices.length), bar: Math.max(0, 100 - r.vices.length * 20), note: r.vices.length ? r.vices[0].fix : 'Nenhum vício do catálogo', level: r.vices.length ? 'warn' : 'ok' }
    ];
    return { cards, result: r };
  }
};

ModuleRegistry.register('MarkdownExporter', MarkdownExporter, { kind: 'export' });
ModuleRegistry.register('PdfExporter', PdfExporter, { kind: 'export' });
ModuleRegistry.register('DraftExporter', DraftExporter, { kind: 'export' });
ModuleRegistry.register('SnapshotManager', SnapshotManager, { kind: 'export' });
ModuleRegistry.register('ReportMarkdown', ReportMarkdown, { kind: 'export' });
ModuleRegistry.register('ReportPdfData', ReportPdfData, { kind: 'export' });
ModuleRegistry.register('ResultCards', ResultCards, { kind: 'interface' });

/* ── 19. SPAWN FINISH ──────────────────────────────────────── */
const SpawnFinish = {
  detectedBaseUrl: null,
  defaultBaseUrl: 'https://prod-scoringservice.matific.com/',
  _customUrl: null, _customToken: null,
  get baseUrl() { return this._customUrl || this.detectedBaseUrl || Store.data.settings.spawnBaseUrl || this.defaultBaseUrl; },
  set baseUrl(v) { this._customUrl = v; Store.data.settings.spawnBaseUrl = v; Store.save(); },
  get token() { return this._customToken || Store.data.settings.spawnToken
    || Utils.cookie('user_data_token') || Utils.cookie('userDataToken')
    || Utils.cookie('matific_user_token') || Utils.cookie('user_token') || null; },
  set token(v) { this._customToken = v; Store.data.settings.spawnToken = v; Store.save(); },
  extractSlug(el) {
    if (!el) return null;
    const ds = el.dataset || {};
    const cand = ['episodeSlug','slug','episode_slug','episodeName','name'];
    for (const k of cand) if (ds[k]) return String(ds[k]);
    for (const k of Object.keys(ds)) if (/slug/i.test(k) && ds[k]) return String(ds[k]);
    const img = el.querySelector && el.querySelector('img[src*="static1.matific.com"]');
    if (img) { const m = img.src.match(/\/([^\/?]+?)\.(png|jpg|jpeg)/i); if (m) return m[1]; }
    const a = el.closest && el.closest('a[href]');
    if (a) { const m = a.href.match(/episode[\/=]([a-zA-Z0-9_\-]+)/i); if (m) return m[1]; }
    try {
      const k = FiberLens.fiberKey(el);
      if (k) {
        let f = el[k];
        for (let i = 0; f && i < 40; i++, f = f.return) {
          const p = f.memoizedProps;
          if (p && typeof p === 'object') for (const key in p) {
            const v = p[key];
            if (typeof v === 'string' && /slug|episodeId|episodeName/i.test(key) && v.length > 2) return v;
          }
        }
      }
    } catch {}
    return null;
  },
  buildFinishFact(opts = {}) {
    const { slug='SpawnFinish', episodeName='SpawnFinish', stars=5, score=null, problemCount=10, sinceSec=60, assignmentId=null } = opts;
    const finalScore = score != null ? score : (CFG.starScoreMap[stars] ?? 2500);
    const runId = Utils.uuid();
    const fact = {
      episode_slug: slug, episode_name: episodeName, episode_version: '1.0.0',
      type: 'FinishEpisode', eventType: 'FinishEpisode',
      episode_run_discriminator: runId, episodeSessionId: runId,
      stars, score: finalScore, points: finalScore,
      problem_count: problemCount, problemCount,
      client_time: Date.now(), time_diff: 0, from_tablet: false,
      since_episode_start_sec: sinceSec, sinceStart: sinceSec * 1000,
      episode_duration: sinceSec * 1000,
      is_correct: 0, correct: 0, since_question_start_sec: 5,
      activity_context: 13, load_time_sec: 3,
      version: '7.21.3', PlatformVersion: '7.21.3',
      DB_version: null, DBVersion: null
    };
    if (assignmentId) fact.assignment_id = assignmentId;
    return fact;
  },
  buildSequence(opts = {}) {
    const { slug='SpawnFinish', episodeName='SpawnFinish', stars=5, score=null, problemCount=10, sinceSec=60 } = opts;
    const finalScore = score != null ? score : (CFG.starScoreMap[stars] ?? 2500);
    const now = Date.now(); const runId = Utils.uuid();
    const mk = (type, extra) => ({
      episode_slug: slug, episode_name: episodeName, episode_version: '1.0.0',
      type, eventType: type, episode_run_discriminator: runId, episodeSessionId: runId,
      client_time: now, time_diff: 0, from_tablet: false, activity_context: 13,
      PlatformVersion: '7.21.3', DB_version: null, ...extra
    });
    const facts = [mk('StartEpisode', { problem_count: problemCount, problemCount, load_time_sec: 3, ranInAdaptiveMode: false, noProgressBarInEnvelope: false })];
    for (let i = 0; i < problemCount; i++) {
      facts.push(mk('PresentProblemIntro', { problemIndex: i, problem_index: i, problem_count: problemCount }));
      facts.push(mk('PresentProblem', { problemIndex: i, problem_index: i, problem_count: problemCount }));
      facts.push(mk('SubmitSolution', { problemIndex: i, problem_index: i, problem_count: problemCount, is_correct: 1, correct: 1, attempt: 1, mistakes: 0, step_count: 1, step_index: 0, grade_count: 1, since_question_start_sec: 3 }));
      facts.push(mk('CompletedProblem', { problemIndex: i, problem_index: i, problem_count: problemCount, grade_count: 1, step_count: 1 }));
    }
    facts.push(mk('FinishEpisode', { stars, score: finalScore, points: finalScore, problem_count: problemCount, problemCount, since_episode_start_sec: sinceSec, sinceStart: sinceSec * 1000, episode_duration: sinceSec * 1000 }));
    return facts;
  },
  async sendFacts(facts, opts = {}) {
    const { token = null, url = null, silent = false } = opts;
    const tk = token || this.token;
    if (!tk) { Logger.err('❌ user_data_token não encontrado. Configure na aba 🌌 Spawn.'); return { ok: false, err: 'no_token' }; }
    const base = (url || this.baseUrl).replace(/\/+$/, '') + '/';
    const endpoint = base + 'addFacts';
    if (!silent) Logger.info(`📡 POST ${endpoint} (${facts.length} fact${facts.length > 1 ? 's' : ''})`);
    try {
      const res = await fetch(endpoint, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts, user_data_token: tk })
      });
      const txt = await res.text();
      const snip = txt.slice(0, 200);
      res.ok ? Logger.ok(`✅ addFacts ${res.status}: ${snip || '(vazio)'}`) : Logger.warn(`⚠ addFacts ${res.status}: ${snip}`);
      return { ok: res.ok, status: res.status, text: txt };
    } catch (e) { Logger.err(`❌ POST falhou: ${e.message}`); return { ok: false, err: e.message }; }
  },
  async spawnAll(episodes, opts = {}) {
    const { stars=5, score=null, problemCount=10, sinceSec=60, withSequence=false, broadcast=true, batchSize=20 } = opts;
    if (!episodes?.length) { Logger.warn('Nenhum episódio para spawnar'); return { ok: false, err: 'no_episodes' }; }
    Logger.warn(`🌌 Spawning ${episodes.length} episódios (${stars}⭐${score != null ? ' · ' + score + 'pts' : ''})`);
    const allFacts = []; const meta = [];
    for (const ep of episodes) {
      const slug = this.extractSlug(ep.el) || ep.slug || 'SpawnFinish';
      if (withSequence) allFacts.push(...this.buildSequence({ slug, episodeName: slug, stars, score, problemCount, sinceSec }));
      else allFacts.push(this.buildFinishFact({ slug, episodeName: slug, stars, score, problemCount, sinceSec }));
      meta.push({ slug });
    }
    Logger.info(`📦 ${allFacts.length} facts montados (${meta.length} eps)`);
    if (broadcast) for (let i = 0; i < episodes.length; i++) setTimeout(() => {
      try { IframeBridge.sendToEpisode(Msg.finishEpisode(stars, score)); IframeBridge.sendToApp(Msg.finishEpisodeApp(stars, score)); } catch {}
    }, i * 100);
    let totalOk = 0, totalFail = 0; const results = [];
    for (let i = 0; i < allFacts.length; i += batchSize) {
      const batch = allFacts.slice(i, i + batchSize);
      const r = await this.sendFacts(batch, { token: opts.token, url: opts.url });
      results.push(r);
      if (r.ok) totalOk += batch.length; else totalFail += batch.length;
      if (i + batchSize < allFacts.length) await Utils.sleep(300);
    }
    Logger.log(`🌌 Spawn finalizado: ${totalOk} facts OK, ${totalFail} falhas`, totalFail > 0 ? 'warn' : 'success');
    return { ok: totalFail === 0, totalFacts: allFacts.length, ok_count: totalOk, fail_count: totalFail, results };
  },
  async spawnCustom(slugs, opts = {}) {
    const { stars=5, score=null, problemCount=10, sinceSec=60, withSequence=false, batchSize=20 } = opts;
    const list = Array.isArray(slugs) ? slugs : String(slugs).split(/[,\s]+/).filter(Boolean);
    if (!list.length) return { ok: false, err: 'no_slugs' };
    Logger.warn(`🌌 Spawn custom: ${list.length} slugs`);
    const allFacts = [];
    for (const slug of list) {
      if (withSequence) allFacts.push(...this.buildSequence({ slug, episodeName: slug, stars, score, problemCount, sinceSec }));
      else allFacts.push(this.buildFinishFact({ slug, episodeName: slug, stars, score, problemCount, sinceSec }));
    }
    let totalOk = 0, totalFail = 0; const results = [];
    for (let i = 0; i < allFacts.length; i += batchSize) {
      const batch = allFacts.slice(i, i + batchSize);
      const r = await this.sendFacts(batch, { token: opts.token, url: opts.url });
      results.push(r);
      if (r.ok) totalOk += batch.length; else totalFail += batch.length;
      if (i + batchSize < allFacts.length) await Utils.sleep(300);
    }
    Logger.log(`🌌 Spawn custom: ${totalOk} OK, ${totalFail} falhas`, totalFail > 0 ? 'warn' : 'success');
    return { ok: totalFail === 0, totalFacts: allFacts.length, ok_count: totalOk, fail_count: totalFail, results };
  },
  async testEndpoint() {
    Logger.info('🧪 Testando endpoint com fact dummy...');
    const fact = this.buildFinishFact({ slug: 'SpawnTest', episodeName: 'SpawnTest', stars: 1, score: 100, problemCount: 1, sinceSec: 1 });
    return await this.sendFacts([fact]);
  }
};

/* ── 20. EPISODE SCANNER ───────────────────────────────────── */
const EpisodeScanner = {
  _cache: new Map(),
  scan() {
    const found = []; const seen = new Set();
    ['[data-episode-id]','[data-episodeid]','[data-episode-url]','[data-episode-slug]','[data-testid*="episode"]','[data-tile-id]','[data-item-id]'].forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const id = el.dataset.episodeId || el.dataset.episodeid || el.dataset.tileId || el.dataset.itemId;
          const url = el.dataset.episodeUrl, slug = el.dataset.episodeSlug;
          const key = id || url || slug;
          if (key && !seen.has(key)) { seen.add(key); found.push({ el, id, url, slug, source: sel }); }
        });
      } catch {}
    });
    try {
      document.querySelectorAll('img[src*="static1.matific.com/v1/346x242"]').forEach(img => {
        const card = img.closest('a, button, [role="button"], [class*="tile"], [class*="card"], [class*="episode"]');
        if (!card) return;
        const key = img.src;
        if (seen.has(key)) return;
        seen.add(key);
        const m = img.src.match(/\/([^\/?]+)\.(png|jpg|jpeg)/i);
        found.push({ el: card, id: null, url: null, slug: m ? m[1] : null, source: 'thumbnail', img });
      });
    } catch {}
    try {
      document.querySelectorAll('[class*="episode"], [class*="tile"], [class*="card"]').forEach(el => {
        if (found.some(f => f.el === el)) return;
        const text = (el.textContent || '').slice(0, 100).toLowerCase();
        const hasStars = el.querySelector('[class*="star"], svg[class*="star"], [aria-label*="star"]');
        if (hasStars || text.includes('episode') || text.includes('episódio')) {
          found.push({ el, id: null, url: null, slug: null, source: 'card', hasStars: !!hasStars });
        }
      });
    } catch {}
    found.forEach(f => {
      const k = f.id || f.url || f.slug || (f.el && f.el.getAttribute('id')) || Math.random().toString(36);
      f._key = k;
      this._cache.set(k, f);
    });
    Logger.info(`🔎 EpisodeScanner: ${found.length} eps`);
    return found;
  },
  getAll() { return [...this._cache.values()]; },
  click(ep) {
    try {
      ['mousedown', 'mouseup', 'click'].forEach(t => ep.el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })));
      Logger.info(`👆 Clicado: ${ep.slug || ep.id || ep._key}`);
      return { ok: true, ep };
    } catch (e) { return { ok: false, err: e.message }; }
  },
  clear() { this._cache.clear(); }
};

/* ── 21. LEVEL UNLOCKER ────────────────────────────────────── */
const LevelUnlocker = {
  buildMaxStoredData(opts = {}) {
    const { episodeId=null, episodeInstanceId=null, totalLevels=20, stars=5, score=null, context=13, randomSeed=1366, expireInSec=86400*30 } = opts;
    const finalScore = score != null ? score : (CFG.starScoreMap[stars] ?? 2500);
    const answered = Array.from({ length: totalLevels }, (_, i) => i + 1);
    return {
      expiredAt: Math.floor(Date.now()/1000) + expireInSec,
      score: finalScore, level: totalLevels, episodeId, context,
      episode_instance_id: episodeInstanceId,
      levelScreenData: {
        userProgressHasChanged: true, starsPoints: stars * 100, presentScreen: 1,
        answeredLevels: answered, lastOpenLevel: totalLevels,
        answeredLevelsWithMedal: [...answered], dataByProblemId: {}, hintsPressed: {}
      },
      updateId: Utils.uuid(), randomSeed, stars, episode_run_discriminator: Utils.uuid()
    };
  },
  unlockAll(opts = {}) {
    const stored = this.buildMaxStoredData(opts);
    const msg = Msg.startSuspended(stored);
    const r = IframeBridge.sendToEpisode(msg);
    Logger.ok(`🔓 UnlockAll → ${r.length} iframe(s)`);
    return { msg, results: r };
  },
  async unlockInFirebase() {
    const fb = window.matificFirestoreService;
    if (!fb?.db) return { ok: false, err: 'Firebase indisponível' };
    const uid = fb.user?.uid || fb.matificUser?.user_id || Utils.cookie('user_id');
    if (!uid) return { ok: false, err: 'UID indisponível' };
    try {
      await fb.db.collection('students').doc(uid).set({
        'progress.userProgressHasChanged': true,
        'progress.lastOpenLevel': 20,
        'progress.starsPoints': 6000,
        'progress.lastUpdate': new Date()
      }, { merge: true });
      Logger.ok(`🔓 Firebase unlock em students/${uid}`);
      return { ok: true, uid };
    } catch (e) { return { ok: false, err: e.message }; }
  }
};

/* ── 22. AUTO COMPLETER ────────────────────────────────────── */
const AutoCompleter = {
  running: false, queue: [], results: [], _abortFlag: false,
  _delay: 800, _stars: 5, _customScore: null,
  stats: { total: 0, done: 0, failed: 0 },
  reset() { this.running = false; this.queue = []; this.results = []; this._abortFlag = false; this.stats = { total: 0, done: 0, failed: 0 }; },
  enqueue(episodes, opts = {}) {
    const { stars = 5, delay = 800, score = null } = opts;
    this._stars = stars; this._customScore = score; this._delay = delay;
    episodes.forEach(ep => this.queue.push({ ep, stars, score, state: 'pending' }));
    this.stats.total = this.queue.length;
    UI._refreshAutoUI();
  },
  async processOne(item) {
    const ep = item.ep;
    const stars = item.stars || this._stars;
    const score = item.score != null ? item.score : this._customScore;
    item.state = 'processing'; UI._refreshAutoUI();
    try {
      IframeBridge.sendToEpisode(Msg.finishEpisode(stars, score));
      IframeBridge.sendToApp(Msg.finishEpisodeApp(stars, score));
      if (ep?.el) {
        EpisodeScanner.click(ep);
        await Utils.sleep(Math.max(1200, this._delay));
        IframeBridge.sendToEpisode(Msg.finishEpisode(stars, score));
        IframeBridge.sendToApp(Msg.finishEpisodeApp(stars, score));
      }
      item.state = 'done'; this.stats.done++;
      Logger.ok(`✅ [${this.stats.done}/${this.stats.total}]`);
    } catch (e) { item.state = 'failed'; this.stats.failed++; Logger.err(`❌ ${e.message}`); }
    UI._refreshAutoUI();
  },
  async runAll(opts = {}) {
    if (this.running) return;
    if (!this.queue.length) {
      const eps = EpisodeScanner.scan();
      if (!eps.length) return Logger.warn('Nada para processar');
      this.enqueue(eps, opts);
    }
    this.running = true; this._abortFlag = false;
    if (opts.delay) this._delay = opts.delay;
    if (opts.stars) this._stars = opts.stars;
    if (opts.score != null) this._customScore = opts.score;
    Logger.warn('🚀 Auto-complete iniciado');
    for (const item of this.queue) {
      if (this._abortFlag) break;
      if (item.state === 'done') continue;
      await this.processOne(item);
      if (!this._abortFlag) await Utils.sleep(this._delay);
    }
    this.running = false;
    Logger.info(`🏁 Finalizado: ${this.stats.done} OK / ${this.stats.failed} falhas`);
    UI._refreshAutoUI();
  },
  stop() { this._abortFlag = true; this.running = false; Logger.warn('⏹ Parando'); },
  _watcherActive: false, _watcherHandler: null,
  watchAutoFinish(stars = 5, enabled = true, score = null) {
    if (!enabled) {
      if (this._watcherHandler) window.removeEventListener('message', this._watcherHandler, true);
      this._watcherActive = false;
      Logger.info('👁 Watcher OFF');
      return;
    }
    if (this._watcherActive) return;
    this._watcherHandler = (e) => {
      try {
        const data = Utils.parseMaybeJson(e.data);
        if (!data || typeof data !== 'object') return;
        const type = data.type || data.Type;
        if (type === 'EpisodeReady' || type === 'StartEpisode') {
          Logger.info(`👁 ${type} → auto-finish`);
          setTimeout(() => {
            IframeBridge.sendToEpisode(Msg.finishEpisode(stars, score));
            IframeBridge.sendToApp(Msg.finishEpisodeApp(stars, score));
          }, 500);
        }
      } catch {}
    };
    window.addEventListener('message', this._watcherHandler, true);
    this._watcherActive = true;
    Logger.ok(`👁 Watcher ON (${stars}⭐)`);
  }
};


/* ── GAME TOOLS: catálogo e abertura de episódios ───────────── */
const GameTools = {
  _episodes: [],

  list(query = '') {
    this._episodes = EpisodeScanner.scan();
    const term = String(query).trim().toLocaleLowerCase();
    const results = this._episodes
      .map((episode, index) => {
        const element = episode.el;
        const name = String(element?.innerText || element?.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        const url = episode.url
          || element?.closest?.('a[href]')?.href
          || element?.getAttribute?.('href')
          || '';
        const visible = !!element?.isConnected
          && element.getClientRects().length > 0
          && getComputedStyle(element).visibility !== 'hidden';

        return {
          name: name || episode.slug || episode.id || `Episódio ${index + 1}`,
          slug: episode.slug || null,
          id: episode.id || null,
          url,
          source: episode.source,
          visible,
          element,
          episode
        };
      })
      .filter(episode => !term
        || `${episode.name} ${episode.slug || ''} ${episode.id || ''} ${episode.url}`
          .toLocaleLowerCase()
          .includes(term));

    this._episodes = results.map(item => item.episode);
    Logger.info(`🎮 Jogos encontrados: ${results.length}`);
    return results.map(({ episode, ...item }, index) => ({ index, ...item }));
  },

  open(target) {
    let episode;
    if (Number.isInteger(target)) {
      episode = this._episodes[target];
    } else if (typeof target === 'string' && target.trim()) {
      const term = target.trim().toLocaleLowerCase();
      episode = this._episodes.find(item => {
        const text = `${item.slug || ''} ${item.id || ''} ${item.el?.innerText || item.el?.textContent || ''}`;
        return text.toLocaleLowerCase().includes(term);
      });
    }

    if (!episode?.el?.isConnected) {
      const err = 'Episódio não encontrado: use games.list() e escolha um índice, slug ou ID.';
      Logger.warn(`🎮 ${err}`);
      return { ok: false, err };
    }

    try {
      episode.el.click();
      Logger.info(`🎮 Abrindo: ${episode.slug || episode.id || episode.el.textContent?.trim().slice(0, 80) || 'episódio'}`);
      return { ok: true, episode };
    } catch (error) {
      Logger.err(`🎮 Falha ao abrir episódio: ${error.message}`);
      return { ok: false, err: error.message };
    }
  }
};

/* ── VESSIEOS GAME CATALOG ─────────────────────────────────── */
const GameCatalog = Object.freeze({
  vessieOS: Object.freeze({
    id: 'vessie-os',
    title: 'VessieOS',
    url: 'https://kauanhenriquealvesdosreis-ai.github.io/VessieOS/'
  })
});

/* ── REPERTÓRIO CONFIÁVEL: leis, pensadores, filmes, séries, documentos ──
   Fontes: Constituição, leis federais, DUDH, ODS/Agenda 2030, obras canônicas. */

const LawsBank = {
  items: [
    { id: 'cf-art5', title: 'CF/1988, art. 5º', use: 'Igualdade e direitos fundamentais; base para inclusão e não discriminação.' },
    { id: 'cf-art6', title: 'CF/1988, art. 6º', use: 'Direitos sociais: educação, saúde, moradia, trabalho.' },
    { id: 'cf-art205', title: 'CF/1988, art. 205', use: 'Educação como direito e dever do Estado e da família.' },
    { id: 'cf-art225', title: 'CF/1988, art. 225', use: 'Meio ambiente equilibrado; sustentabilidade.' },
    { id: 'eca', title: 'ECA — Lei 8.069/1990', use: 'Proteção integral de crianças e adolescentes.' },
    { id: 'idoso', title: 'Estatuto do Idoso — Lei 10.741/2003', use: 'Envelhecimento, acessibilidade e cuidado.' },
    { id: 'maria-penha', title: 'Lei Maria da Penha — 11.340/2006', use: 'Violência doméstica e de gênero.' },
    { id: 'ldb', title: 'LDB — Lei 9.394/1996', use: 'Diretrizes da educação nacional.' },
    { id: 'cotas', title: 'Lei de Cotas — 12.711/2012', use: 'Acesso ao ensino superior e reparação.' },
    { id: 'igualdade-racial', title: 'Estatuto da Igualdade Racial — 12.288/2010', use: 'Desigualdade racial e políticas afirmativas.' },
    { id: 'lbi', title: 'LBI — Lei 13.146/2015', use: 'Inclusão da pessoa com deficiência.' },
    { id: 'marco-civil', title: 'Marco Civil — 12.965/2014', use: 'Direitos na internet, privacidade e consumo digital.' },
    { id: 'lgpd', title: 'LGPD — 13.709/2018', use: 'Dados pessoais, vigilância e consumo.' },
    { id: 'pnrs', title: 'PNRS — Lei 12.305/2010', use: 'Resíduos sólidos e consumo sustentável.' }
  ],
  norm(s) { try { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { return String(s || '').toLowerCase(); } },
  find(term = '') {
    const q = this.norm(term);
    return this.items.filter(i => !q || this.norm(i.title + ' ' + i.use).includes(q));
  }
};

const ThinkersBank = {
  items: [
    { name: 'Paulo Freire', idea: 'Educação libertadora e conscientização.', work: 'Pedagogia do Oprimido' },
    { name: 'Darcy Ribeiro', idea: 'Desigualdade educacional e antropologia brasileira.', work: 'O Povo Brasileiro' },
    { name: 'Florestan Fernandes', idea: 'Racismo estrutural e integração do negro.', work: 'A Integração do Negro na Sociedade de Classes' },
    { name: 'Milton Santos', idea: 'Território, globalização e cidadania.', work: 'Por uma Outra Globalização' },
    { name: 'Sérgio Buarque de Holanda', idea: 'Cordialidade e personalismo nas instituições.', work: 'Raízes do Brasil' },
    { name: 'Djamila Ribeiro', idea: 'Lugar de fala e feminismo negro.', work: 'Lugar de Fala' },
    { name: 'Sueli Carneiro', idea: 'Enegrecer o feminismo; racismo e gênero.', work: 'Racismo, Sexismo e Desigualdade' },
    { name: 'Zygmunt Bauman', idea: 'Modernidade líquida e consumo.', work: 'Vida para Consumo' },
    { name: 'Pierre Bourdieu', idea: 'Capital cultural e reprodução das desigualdades.', work: 'A Distinção' },
    { name: 'Michel Foucault', idea: 'Poder, vigilância e disciplina.', work: 'Vigiar e Punir' },
    { name: 'Hannah Arendt', idea: 'Banalidade do mal e espaço público.', work: 'Eichmann em Jerusalém' },
    { name: 'Edgar Morin', idea: 'Pensamento complexo e sustentabilidade.', work: 'Os Sete Saberes' }
  ],
  norm(s) { try { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { return String(s || '').toLowerCase(); } },
  find(term = '') {
    const q = this.norm(term);
    return this.items.filter(t => !q || this.norm(t.name + ' ' + t.idea + ' ' + t.work).includes(q));
  }
};

const FilmsBank = {
  items: [
    { title: 'Que Horas Ela Volta? (2015)', theme: 'Desigualdade doméstica e de classe', use: 'Trabalho doméstico, mobilidade e preconceito.' },
    { title: 'Central do Brasil (1998)', theme: 'Exclusão e migração', use: 'Analfabetismo, infância e Estado ausente.' },
    { title: 'Cidade de Deus (2002)', theme: 'Violência e território', use: 'Falta de oportunidades e Estado paralelo.' },
    { title: 'Parasita (2019)', theme: 'Desigualdade global', use: 'Classes, moradia e consumo aspiracional.' },
    { title: 'Tempos Modernos (1936)', theme: 'Trabalho e automação', use: 'Alienação e produtividade.' },
    { title: 'WALL-E (2008)', theme: 'Consumo e sustentabilidade', use: 'Lixo, sedentarismo e colapso ambiental.' },
    { title: 'O Poço (2019)', theme: 'Escassez e egoísmo', use: 'Distribuição de recursos e solidariedade.' },
    { title: 'Pureza (2019)', theme: 'Trabalho escravo', use: 'Exploração e fiscalização.' }
  ]
};

const SeriesBank = {
  items: [
    { title: 'Black Mirror (Nosedive / Smithereens)', theme: 'Redes e consumo de atenção', use: 'Validação social, dados e saúde mental.' },
    { title: 'O Dilema das Redes (doc., 2020)', theme: 'Economia da atenção', use: 'Algoritmos, polarização e consumo.' },
    { title: '3% (Brasil)', theme: 'Meritocracia excludente', use: 'Crítica a processos seletivos sem equidade.' },
    { title: 'Segunda Chamada (Globoplay)', theme: 'EJA e exclusão escolar', use: 'Evasão e retorno à escola.' }
  ]
};

const DocsBank = {
  items: [
    { id: 'dudh', title: 'DUDH (1948)', use: 'Dignidade, igualdade e direitos universais.' },
    { id: 'ods', title: 'Agenda 2030 / ODS (ONU)', use: '17 objetivos: pobreza, educação, clima, igualdade.' },
    { id: 'paris', title: 'Acordo de Paris (2015)', use: 'Clima e responsabilidade dos Estados.' },
    { id: 'cdc', title: 'Convenção sobre os Direitos da Criança (1989)', use: 'Infância e proteção integral.' },
    { id: 'cdpd', title: 'Convenção sobre Direitos das Pessoas com Deficiência (2006)', use: 'Acessibilidade e inclusão.' },
    { id: 'kyoto', title: 'Protocolo de Kyoto (1997)', use: 'Emissões e desenvolvimento sustentável.' }
  ]
};

const RepertoireBank = {
  norm(s) { try { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { return String(s || '').toLowerCase(); } },
  // Fachada única: busca em todos os bancos.
  search(term = '') {
    const q = this.norm(term);
    return {
      laws: LawsBank.find(term),
      thinkers: ThinkersBank.find(term),
      films: FilmsBank.items.filter(f => !q || this.norm(f.title + f.theme + f.use).includes(q)),
      series: SeriesBank.items.filter(s => !q || this.norm(s.title + s.theme + s.use).includes(q)),
      docs: DocsBank.items.filter(d => !q || this.norm(d.title + d.use).includes(q))
    };
  },
  cite(kind, title) { return `[${kind}] ${title}`; }
};

ModuleRegistry.register('LawsBank', LawsBank, { kind: 'repertoire' });
ModuleRegistry.register('ThinkersBank', ThinkersBank, { kind: 'repertoire' });
ModuleRegistry.register('FilmsBank', FilmsBank, { kind: 'repertoire' });
ModuleRegistry.register('SeriesBank', SeriesBank, { kind: 'repertoire' });
ModuleRegistry.register('DocsBank', DocsBank, { kind: 'repertoire' });
ModuleRegistry.register('RepertoireBank', RepertoireBank, { kind: 'repertoire' });

/* ── TEMAS DE REDAÇÃO (questões sociais/culturais brasileiras) + mapa tema→repertório ── */

const EssayThemes = {
  items: [
    { id: 't01', title: 'Desigualdade de acesso à educação no Brasil', axis: 'educação' },
    { id: 't02', title: 'Racismo estrutural e mercado de trabalho', axis: 'igualdade' },
    { id: 't03', title: 'Violência contra a mulher e subnotificação', axis: 'gênero' },
    { id: 't04', title: 'Consumismo e endividamento das famílias', axis: 'consumo' },
    { id: 't05', title: 'Publicidade infantil e consumo precoce', axis: 'consumo' },
    { id: 't06', title: 'Crise climática e justiça ambiental nas periferias', axis: 'sustentabilidade' },
    { id: 't07', title: 'Descarte de lixo eletrônico e obsolescência programada', axis: 'sustentabilidade' },
    { id: 't08', title: 'Inclusão de pessoas com deficiência na escola', axis: 'inclusão' },
    { id: 't09', title: 'Envelhecimento populacional e cuidado', axis: 'inclusão' },
    { id: 't10', title: 'Saúde mental e redes sociais entre jovens', axis: 'tecnologia' },
    { id: 't11', title: 'Desinformação e polarização nas plataformas', axis: 'tecnologia' },
    { id: 't12', title: 'Trabalho por aplicativo e precarização', axis: 'trabalho' },
    { id: 't13', title: 'Trabalho infantil e evasão escolar', axis: 'trabalho' },
    { id: 't14', title: 'Mobilidade urbana e direito à cidade', axis: 'cidade' },
    { id: 't15', title: 'Saneamento básico e saúde pública', axis: 'cidade' },
    { id: 't16', title: 'Segurança alimentar e desperdício', axis: 'sustentabilidade' },
    { id: 't17', title: 'Cultura do cancelamento e debate público', axis: 'cultura' },
    { id: 't18', title: 'Preservação do patrimônio cultural e memória', axis: 'cultura' },
    { id: 't19', title: 'Migração e acolhimento de refugiados', axis: 'inclusão' },
    { id: 't20', title: 'Acesso à internet como direito', axis: 'tecnologia' },
    { id: 't21', title: 'Apostas online e vulnerabilidade financeira', axis: 'consumo' },
    { id: 't22', title: 'Evasão escolar no ensino médio', axis: 'educação' },
    { id: 't23', title: 'Violência nas escolas e cultura de paz', axis: 'educação' },
    { id: 't24', title: 'Democratização do acesso à cultura', axis: 'cultura' },
    { id: 't25', title: 'Água, escassez e gestão pública', axis: 'sustentabilidade' }
  ],
  random() { return this.items[Math.floor(Math.random() * this.items.length)]; },
  byAxis(axis = '') {
    const q = axis.toLowerCase();
    return this.items.filter(t => !q || t.axis.includes(q) || t.title.toLowerCase().includes(q));
  }
};

const ThemeRepertoire = {
  // Sugestões prontas por eixo (atalho para treino).
  map: {
    'educação': ['LDB — Lei 9.394/1996', 'CF/1988, art. 205', 'Paulo Freire — Pedagogia do Oprimido', 'Segunda Chamada (série)'],
    'igualdade': ['Estatuto da Igualdade Racial — 12.288/2010', 'Florestan Fernandes', 'Que Horas Ela Volta? (2015)'],
    'consumo': ['Zygmunt Bauman — Vida para Consumo', 'WALL-E (2008)', 'PNRS — Lei 12.305/2010'],
    'sustentabilidade': ['CF/1988, art. 225', 'Acordo de Paris (2015)', 'Agenda 2030 / ODS (ONU)'],
    'inclusão': ['LBI — Lei 13.146/2015', 'CF/1988, art. 5º', 'Convenção sobre Direitos das Pessoas com Deficiência'],
    'tecnologia': ['Marco Civil — 12.965/2014', 'LGPD — 13.709/2018', 'O Dilema das Redes (2020)'],
    'trabalho': ['Tempos Modernos (1936)', 'Pureza (2019)', 'CF/1988, art. 6º'],
    'gênero': ['Lei Maria da Penha — 11.340/2006', 'Djamila Ribeiro — Lugar de Fala', 'DUDH (1948)']
  },
  suggest(themeTitle = '') {
    const low = themeTitle.toLowerCase();
    for (const [axis, reps] of Object.entries(this.map)) {
      if (low.includes(axis)) return { axis, repertoire: reps };
    }
    return { axis: 'geral', repertoire: ['DUDH (1948)', 'CF/1988, art. 5º', 'Agenda 2030 / ODS (ONU)'] };
  }
};

ModuleRegistry.register('EssayThemes', EssayThemes, { kind: 'content' });
ModuleRegistry.register('ThemeRepertoire', ThemeRepertoire, { kind: 'content' });

Vessie.registerMetric('cohesion.connectors', 'coesão', 'Variedade de conectivos', ({ normalized }) => {
  const hits = normalized.match(/\b(além disso|porém|contudo|portanto|assim|entretanto|embora|por conseguinte|desse modo|em síntese)\b/gu) || [];
  return { score: Math.min(100, hits.length * 18), finding: `${hits.length} articuladores identificados.`, advice: hits.length < 3 ? 'Conecte ideias com relações explícitas de causa, contraste e conclusão.' : '' };
});

Vessie.registerMetric('cohesion.transitions', 'coesão', 'Relações entre ideias', ({ normalized }) => {
  const kinds = [/porque|pois|visto que/u, /portanto|assim|logo/u, /porém|contudo|entretanto/u, /além disso|ademais/u].filter(rx => rx.test(normalized)).length;
  return { score: kinds * 25, finding: `${kinds} tipos de relação argumentativa encontrados.`, advice: kinds < 3 ? 'Explicite mais de um tipo de relação lógica entre os argumentos.' : '' };
});

Vessie.registerMetric('cohesion.reference', 'coesão', 'Retomada de referentes', ({ normalized }) => {
  const hits = (normalized.match(/\b(esse|essa|isso|tal|tais|o qual|a qual|seu|sua|esses|essas)\b/gu) || []).length;
  return { score: Math.min(100, hits * 12), finding: `${hits} possíveis retomadas pronominais.`, advice: hits === 0 ? 'Retome conceitos já apresentados para ligar as frases sem repetir o nome toda vez.' : 'Confira se cada pronome tem referente inequívoco.' };
});

Vessie.registerMetric('cohesion.paragraphs', 'coesão', 'Organização em parágrafos', ({ paragraphs }) => {
  const score = paragraphs.length >= 4 ? 100 : paragraphs.length === 3 ? 75 : paragraphs.length === 2 ? 50 : 20;
  return { score, finding: `${paragraphs.length} parágrafo(s).`, advice: paragraphs.length < 4 ? 'Em textos dissertativos, considere separar introdução, argumentos e conclusão.' : '' };
});

Vessie.registerMetric('cohesion.balance', 'coesão', 'Equilíbrio entre parágrafos', ({ paragraphs }) => {
  if (paragraphs.length < 2) return { score: 30, finding: 'Ainda não há parágrafos suficientes para comparar.', advice: 'Separe as etapas do raciocínio.' };
  const counts = paragraphs.map(p => p.split(/\s+/u).filter(Boolean).length);
  const ratio = Math.min(...counts) / Math.max(...counts);
  return { score: Math.round(ratio * 100), finding: `Proporção entre parágrafo menor e maior: ${Math.round(ratio * 100)}%.`, advice: ratio < 0.25 ? 'Revise a distribuição: um parágrafo pode estar excessivamente curto ou longo.' : '' };
});

Vessie.registerMetric('cohesion.cause-effect', 'coesão', 'Causa e consequência', ({ normalized }) => {
  const cause = /\b(porque|devido a|em razão de|uma vez que)\b/u.test(normalized);
  const effect = /\b(consequentemente|por isso|como resultado|resulta|provoca|gera)\b/u.test(normalized);
  return { score: (cause ? 50 : 0) + (effect ? 50 : 0), finding: `Causa: ${cause ? 'sim' : 'não'}; consequência: ${effect ? 'sim' : 'não'}.`, advice: !(cause && effect) ? 'Mostre como as causas se relacionam aos efeitos discutidos.' : '' };
});

Vessie.registerMetric('cohesion.contrast', 'coesão', 'Articulação de contraste', ({ normalized }) => {
  const hits = (normalized.match(/\b(mas|porém|contudo|todavia|entretanto|embora)\b/gu) || []).length;
  return { score: Math.min(100, hits * 25), finding: `${hits} articuladores de contraste.`, advice: hits === 0 ? 'Quando pertinente, contraste perspectivas para aprofundar a análise.' : '' };
});

Vessie.registerMetric('cohesion.conclusion', 'coesão', 'Marcador conclusivo', ({ paragraphs, normalized }) => {
  const last = (paragraphs.at(-1) || '').toLocaleLowerCase('pt-BR');
  const has = /\b(portanto|assim|dessa forma|desse modo|em síntese|logo)\b/u.test(last);
  return { score: has ? 100 : 35, finding: has ? 'Há articulador conclusivo no parágrafo final.' : 'Não foi detectado articulador conclusivo no final.', advice: has ? '' : 'Conclua retomando a tese, sem apenas repetir a introdução.' };
});

Vessie.registerMetric('cohesion.repetition', 'coesão', 'Repetição de conectivos', ({ normalized }) => {
  const forms = ['além disso', 'portanto', 'porém', 'assim', 'contudo'];
  const repeated = forms.filter(word => (normalized.match(new RegExp(`\\b${word}\\b`, 'gu')) || []).length > 3);
  return { score: Math.max(0, 100 - repeated.length * 25), finding: repeated.length ? `Uso frequente: ${repeated.join(', ')}.` : 'Não há conectivo do catálogo repetido mais de três vezes.', advice: repeated.length ? 'Varie os articuladores conforme a relação lógica, não apenas por sinônimos.' : '' };
});

Vessie.registerMetric('cohesion.topic', 'coesão', 'Continuidade temática', ({ paragraphs }) => {
  if (paragraphs.length < 2) return { score: 25, finding: 'Texto curto para comparar continuidade temática.', advice: 'Retome palavras-chave do tema ao avançar os parágrafos.' };
  const sets = paragraphs.map(p => new Set((p.toLowerCase().match(/[\p{L}]{5,}/gu) || [])));
  const overlap = sets.slice(1).filter((set, i) => [...set].some(word => sets[i].has(word))).length;
  return { score: Math.round(overlap / (sets.length - 1) * 100), finding: `${overlap} transição(ões) com vocabulário compartilhado.`, advice: 'Revise se cada parágrafo se conecta ao tema sem apenas repetir termos.' };
});

Vessie.registerMetric('cohesion.pronouns', 'coesão', 'Clareza de pronomes', ({ normalized }) => {
  const vague = (normalized.match(/\b(isso|aquilo|algo|tal coisa)\b/gu) || []).length;
  return { score: Math.max(0, 100 - vague * 18), finding: `${vague} referência(s) potencialmente vaga(s).`, advice: vague ? 'Substitua referências vagas pelo conceito específico que está sendo retomado.' : '' };
});

Vessie.registerMetric('repertoire.references', 'repertório', 'Referências culturais ou legais', ({ normalized }) => {
  const refs = /\b(constituição|lei \d|artigo \d|estatuto|dudh|onu|agenda 2030|paulo freire|milton santos|djamila ribeiro|bauman|bourdieu|foucault|arendt)\b/gu;
  const hits = (normalized.match(refs) || []).length;
  return { score: Math.min(100, hits * 40), finding: `${hits} referência(s) reconhecível(is) no catálogo.`, advice: hits ? 'Verifique a precisão da referência e explique sua ligação com a tese.' : 'Considere pesquisar uma fonte primária pertinente ao tema.' };
});

Vessie.registerMetric('repertoire.examples', 'repertório', 'Exemplificação', ({ normalized }) => {
  const hits = (normalized.match(/\b(por exemplo|como ocorre em|a exemplo de|caso de|ilustra-se)\b/gu) || []).length;
  return { score: Math.min(100, hits * 35), finding: `${hits} marcador(es) de exemplificação.`, advice: hits ? 'Interprete o exemplo em vez de deixá-lo sem análise.' : 'Inclua um exemplo específico que sustente uma afirmação.' };
});

Vessie.registerMetric('repertoire.data', 'repertório', 'Dados e evidências', ({ normalized }) => {
  const numbers = (normalized.match(/\b\d+(?:[,.]\d+)?\s?(?:%|por cento|milhões|mil|bilhões|anos)\b/gu) || []).length;
  return { score: Math.min(100, numbers * 40), finding: `${numbers} dado(s) numérico(s) detectado(s).`, advice: numbers ? 'Cite instituição, data e contexto do dado para que seja verificável.' : 'Dados só ajudam se forem verdadeiros, atuais e atribuídos a uma fonte.' };
});

Vessie.registerMetric('repertoire.attribution', 'repertório', 'Atribuição de fonte', ({ normalized }) => {
  const attribution = /\b(segundo|conforme|de acordo com|dados do|pesquisa (?:do|da|de)|relatório do)\b/u.test(normalized);
  return { score: attribution ? 100 : 25, finding: attribution ? 'Há marcador de atribuição.' : 'Atribuição não identificada.', advice: attribution ? 'Confira se a fonte nomeada realmente publicou o dado.' : 'Atribua dados e ideias a uma fonte verificável.' };
});

Vessie.registerMetric('repertoire.explanation', 'repertório', 'Explicação do repertório', ({ normalized }) => {
  const mentions = /\b(repertório|obra|autor|lei|documento|filme|série|pensador)\b/u.test(normalized);
  const link = /\b(logo|portanto|isso|dessa forma|evidencia|demonstra|relaciona-se|reforça)\b/u.test(normalized);
  return { score: (mentions ? 50 : 0) + (link ? 50 : 0), finding: `Referência: ${mentions ? 'sinalizada' : 'não sinalizada'}; análise: ${link ? 'marcador possível' : 'não identificada'}.`, advice: 'Explique explicitamente o que a referência demonstra sobre o problema.' };
});

Vessie.registerMetric('repertoire.law', 'repertório', 'Uso de legislação', ({ normalized }) => {
  const hasLaw = /\b(lei|artigo|constituição|estatuto|marco civil|lgpd|eca|ldb)\b/u.test(normalized);
  return { score: hasLaw ? 100 : 35, finding: hasLaw ? 'Menção jurídica identificada.' : 'Nenhuma referência legal reconhecida.', advice: hasLaw ? 'Confirme o número, artigo e escopo da norma citada.' : 'Uma norma pode ser útil, desde que realmente se aplique ao recorte.' };
});

Vessie.registerMetric('repertoire.thinker', 'repertório', 'Pensadores', ({ normalized }) => {
  const hits = ['paulo freire', 'milton santos', 'djamila ribeiro', 'sueli carneiro', 'darcy ribeiro', 'florestan fernandes', 'zygmunt bauman', 'hannah arendt'].filter(name => normalized.includes(name)).length;
  return { score: Math.min(100, hits * 50), finding: `${hits} pensador(es) do repertório local identificado(s).`, advice: hits ? 'Evite atribuir ao autor uma ideia que ele não defendeu.' : 'Use autores apenas quando conhecer a ideia e a obra relacionada.' };
});

Vessie.registerMetric('repertoire.work', 'repertório', 'Obras culturais', ({ normalized }) => {
  const hits = ['que horas ela volta', 'central do brasil', 'cidade de deus', 'parasita', 'tempos modernos', 'wall-e', 'o dilema das redes'].filter(title => normalized.includes(title)).length;
  return { score: Math.min(100, hits * 50), finding: `${hits} obra(s) do catálogo detectada(s).`, advice: 'Use a obra como argumento e não apenas como menção decorativa.' };
});

Vessie.registerMetric('repertoire.specificity', 'repertório', 'Especificidade', ({ normalized }) => {
  const vague = (normalized.match(/\b(dizem|todo mundo sabe|é comprovado|estudos mostram)\b/gu) || []).length;
  return { score: Math.max(0, 100 - vague * 35), finding: `${vague} afirmação(ões) sem fonte específica provável(is).`, advice: vague ? 'Identifique quem produziu a evidência, quando e em qual contexto.' : '' };
});

Vessie.registerMetric('repertoire.relevance', 'repertório', 'Ligação com a tese', ({ normalized }) => {
  const thesis = /\b(tese|argumento|portanto|assim|evidencia|demonstra|problema|desafio)\b/u.test(normalized);
  return { score: thesis ? 85 : 40, finding: thesis ? 'Há marcadores de tese/análise.' : 'A relação entre referência e tese não é clara por palavras-chave.', advice: 'Faça a ponte entre repertório, causa discutida e tese em suas próprias palavras.' };
});

Vessie.registerMetric('rhythm.sentence-length', 'ritmo', 'Extensão média das frases', ({ words, sentences }) => {
  const average = sentences.length ? words.length / sentences.length : 0;
  const score = average >= 10 && average <= 28 ? 100 : average < 10 ? Math.min(75, average * 7) : Math.max(15, 100 - (average - 28) * 4);
  return { score, finding: `${average.toFixed(1)} palavras por frase, em média.`, advice: average > 30 ? 'Divida frases longas sem fragmentar o raciocínio.' : average < 8 && sentences.length > 2 ? 'Varie com algumas frases mais desenvolvidas.' : '' };
});

Vessie.registerMetric('rhythm.long-sentences', 'ritmo', 'Frases muito longas', ({ sentences }) => {
  const long = sentences.filter(sentence => sentence.split(/\s+/u).length > 35).length;
  return { score: Math.max(0, 100 - long * 22), finding: `${long} frase(s) com mais de 35 palavras.`, advice: long ? 'Revise essas frases para reduzir ambiguidades e excesso de oração subordinada.' : '' };
});

Vessie.registerMetric('rhythm.short-sentences', 'ritmo', 'Fragmentação', ({ sentences }) => {
  const short = sentences.filter(sentence => sentence.split(/\s+/u).length < 5).length;
  return { score: Math.max(0, 100 - short * 15), finding: `${short} frase(s) com menos de cinco palavras.`, advice: short ? 'Confira se são escolhas expressivas ou fragmentos sem relação sintática.' : '' };
});

Vessie.registerMetric('rhythm.variation', 'ritmo', 'Variação de cadência', ({ sentences }) => {
  if (sentences.length < 3) return { score: 35, finding: 'Amostra curta para avaliar variação.', advice: 'Combine frases concisas e desenvolvidas conforme a ideia.' };
  const lengths = sentences.map(sentence => sentence.split(/\s+/u).length);
  const avg = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const variance = lengths.reduce((sum, value) => sum + (value - avg) ** 2, 0) / lengths.length;
  return { score: Math.min(100, Math.round(Math.sqrt(variance) * 8)), finding: `Desvio de extensão aproximado: ${Math.sqrt(variance).toFixed(1)} palavras.`, advice: 'Evite ritmo monótono ou alternância artificial.' };
});

Vessie.registerMetric('rhythm.punctuation', 'ritmo', 'Pontuação de encerramento', ({ text, sentences }) => {
  const marks = (text.match(/[.!?…](?:["'”’)]*)/gu) || []).length;
  const score = sentences.length ? Math.min(100, Math.round(marks / sentences.length * 100)) : 0;
  return { score, finding: `${marks} sinais de encerramento para ${sentences.length} frases detectadas.`, advice: marks < sentences.length ? 'Revise o fechamento das frases e a pontuação final.' : '' };
});

Vessie.registerMetric('rhythm.paragraph-openings', 'ritmo', 'Variação no início dos parágrafos', ({ paragraphs }) => {
  if (paragraphs.length < 2) return { score: 35, finding: 'Poucos parágrafos para comparar aberturas.', advice: 'Varie a estrutura dos inícios sem perder clareza.' };
  const starts = paragraphs.map(paragraph => (paragraph.match(/^[\p{L}]+/u) || [''])[0].toLowerCase());
  const unique = new Set(starts).size;
  return { score: Math.round(unique / starts.length * 100), finding: `${unique} abertura(s) distintas em ${starts.length} parágrafos.`, advice: unique < starts.length ? 'Evite começar parágrafos consecutivos com o mesmo vocábulo.' : '' };
});

Vessie.registerMetric('rhythm.comma-chains', 'ritmo', 'Encadeamento por vírgulas', ({ text }) => {
  const chains = (text.match(/[^.!?]{100,},[^.!?]{100,},[^.!?]{40,}/gu) || []).length;
  return { score: Math.max(0, 100 - chains * 30), finding: `${chains} possível(is) sequência(s) extensa(s) de orações por vírgulas.`, advice: chains ? 'Avalie ponto, ponto e vírgula ou conectivo para explicitar as relações.' : '' };
});

Vessie.registerMetric('rhythm.passive', 'ritmo', 'Voz passiva', ({ normalized }) => {
  const hits = (normalized.match(/\b(foi|foram|era|eram|será|serão|é|são)\s+\w+(?:ado|ada|ados|adas|ido|ida|idos|idas)\b/gu) || []).length;
  return { score: Math.max(0, 100 - hits * 12), finding: `${hits} construção(ões) possivelmente passiva(s).`, advice: hits > 2 ? 'Prefira voz ativa quando o agente da ação for relevante.' : 'A voz passiva pode ser adequada; revise caso a caso.' };
});

Vessie.registerMetric('rhythm.adverbs', 'ritmo', 'Advérbios em -mente', ({ normalized, words }) => {
  const count = (normalized.match(/\b[\p{L}]+mente\b/gu) || []).length;
  return { score: Math.max(0, 100 - count * 9), finding: `${count} advérbio(s) em -mente (${words.length ? (count / words.length * 100).toFixed(1) : '0'}% do texto).`, advice: count > 4 ? 'Troque advérbios repetidos por verbos ou descrições precisas.' : '' };
});

Vessie.registerMetric('lexical.diversity', 'léxico', 'Diversidade lexical', ({ words, frequencies }) => {
  const diversity = words.length ? frequencies.size / words.length : 0;
  return { score: Math.round(Math.min(100, diversity * 150)), finding: `${Math.round(diversity * 100)}% de tipos lexicais distintos.`, advice: words.length < 80 ? 'A diversidade varia com o tamanho do texto; interprete esta métrica com cautela.' : diversity < 0.4 ? 'Revise repetições, sem substituir palavras por termos imprecisos.' : '' };
});

Vessie.registerMetric('lexical.repeated-words', 'léxico', 'Vocábulos repetidos', ({ frequencies, words }) => {
  const stop = new Set(['para', 'como', 'mais', 'essa', 'esse', 'sobre', 'entre', 'também', 'quando', 'porque', 'muito', 'pela', 'pelo']);
  const repeated = [...frequencies].filter(([word, count]) => count > 5 && !stop.has(word) && word.length > 3);
  return { score: Math.max(0, 100 - repeated.length * 18), finding: repeated.length ? `Repetições: ${repeated.map(([word, count]) => `${word} (${count})`).slice(0, 5).join(', ')}.` : `Nenhum vocábulo não funcional repetido mais de cinco vezes em ${words.length} palavras.`, advice: repeated.length ? 'Use retomadas, pronomes ou reestruture a frase apenas quando mantiver precisão.' : '' };
});

Vessie.registerMetric('lexical.specificity', 'léxico', 'Precisão vocabular', ({ normalized }) => {
  const vague = (normalized.match(/\b(coisa|coisas|algo|negócio|troço|muito bom|muito ruim)\b/gu) || []).length;
  return { score: Math.max(0, 100 - vague * 20), finding: `${vague} termo(s) potencialmente genérico(s).`, advice: vague ? 'Nomeie o fator, grupo, política ou efeito com maior precisão.' : '' };
});

Vessie.registerMetric('lexical.register', 'léxico', 'Registro formal', ({ normalized }) => {
  const informal = (normalized.match(/\b(tipo assim|né|tá|pra|pro|aí|mano|cara)\b/gu) || []).length;
  return { score: Math.max(0, 100 - informal * 25), finding: `${informal} marca(s) de oralidade reconhecida(s).`, advice: informal ? 'Substitua formas coloquiais quando o gênero exigir registro formal.' : '' };
});

Vessie.registerMetric('lexical.first-person', 'léxico', 'Impessoalidade', ({ normalized }) => {
  const hits = (normalized.match(/\b(eu acho|acho que|na minha opinião|eu penso|acredito que)\b/gu) || []).length;
  return { score: Math.max(0, 100 - hits * 25), finding: `${hits} formulação(ões) em primeira pessoa detectada(s).`, advice: hits ? 'Avalie substituir por uma afirmação argumentativa direta, mantendo autoria.' : '' };
});

Vessie.registerMetric('lexical.synonyms', 'léxico', 'Oportunidade de variação', ({ normalized }) => {
  const common = ['importante', 'problema', 'fazer', 'mostrar', 'coisa'];
  const hits = common.filter(word => (normalized.match(new RegExp(`\\b${word}\\b`, 'gu')) || []).length > 2);
  return { score: Math.max(0, 100 - hits.length * 18), finding: hits.length ? `Termos frequentes: ${hits.join(', ')}.` : 'Nenhum termo do catálogo repetido mais de duas vezes.', advice: hits.length ? 'Consulte sinônimos e confira a adequação ao contexto antes de trocar.' : '' };
});

Vessie.registerMetric('lexical.nominalizations', 'léxico', 'Concisão verbal', ({ normalized }) => {
  const hits = (normalized.match(/\b(fazer uma análise|realizar uma avaliação|promover a implementação|dar início|efetuar a realização)\b/gu) || []).length;
  return { score: Math.max(0, 100 - hits * 24), finding: `${hits} perífrase(s) possivelmente substituível(is) por verbo direto.`, advice: hits ? 'Prefira verbos simples quando não houver perda de sentido.' : '' };
});

Vessie.registerMetric('lexical.connectors', 'léxico', 'Repertório de articuladores', ({ normalized }) => {
  const forms = ['além disso', 'ademais', 'também', 'porém', 'contudo', 'todavia', 'portanto', 'logo', 'assim'];
  const distinct = forms.filter(word => normalized.includes(word)).length;
  return { score: Math.min(100, distinct * 15), finding: `${distinct} formas distintas do pequeno catálogo.`, advice: distinct < 3 ? 'Escolha conectivos pela relação lógica, sem usar listas mecanicamente.' : '' };
});

Vessie.registerMetric('lexical.word-length', 'léxico', 'Equilíbrio de palavras longas', ({ words }) => {
  if (!words.length) return { score: 0, finding: 'Sem palavras para avaliar.', advice: '' };
  const long = words.filter(word => word.length > 13).length;
  const ratio = long / words.length;
  return { score: Math.max(0, 100 - Math.round(ratio * 250)), finding: `${Math.round(ratio * 100)}% das palavras têm mais de 13 caracteres.`, advice: ratio > 0.12 ? 'Avalie se termos longos são necessários e claros.' : '' };
});

Vessie.registerMetric('lexical.absolutes', 'léxico', 'Afirmações absolutas', ({ normalized }) => {
  const hits = (normalized.match(/\b(todos|ninguém|sempre|nunca|impossível|completamente)\b/gu) || []).length;
  return { score: Math.max(0, 100 - hits * 12), finding: `${hits} generalização(ões) absoluta(s).`, advice: hits ? 'Delimite o alcance da afirmação e apresente evidências proporcionais.' : '' };
});

Vessie.registerMetric('competence.thesis', 'competências', 'Tese identificável', ({ normalized }) => {
  const has = /\b(tese|defende-se|é necessário|é fundamental|constitui um problema|deve-se)\b/u.test(normalized);
  return { score: has ? 90 : 35, finding: has ? 'Há sinal linguístico de posicionamento.' : 'Tese não detectada por palavras-chave.', advice: 'A avaliação é heurística: confira se a introdução responde ao recorte proposto.' };
});

Vessie.registerMetric('competence.theme', 'competências', 'Delimitação do tema', ({ paragraphs }) => {
  const first = paragraphs[0] || '';
  const words = first.split(/\s+/u).filter(Boolean).length;
  return { score: words >= 20 && words <= 130 ? 85 : 45, finding: `Introdução com ${words} palavras.`, advice: 'Confirme manualmente se a introdução aborda o tema e não se afasta do recorte.' };
});

Vessie.registerMetric('competence.plan', 'competências', 'Projeto de texto', ({ paragraphs }) => {
  return { score: paragraphs.length >= 4 ? 85 : 40, finding: `${paragraphs.length} bloco(s) de texto detectado(s).`, advice: 'Organização em parágrafos é um indício, não comprova progressão argumentativa.' };
});

Vessie.registerMetric('competence.argument', 'competências', 'Desenvolvimento argumentativo', ({ normalized }) => {
  const claims = (normalized.match(/\b(porque|pois|uma vez que|devido a|isso ocorre|decorre de)\b/gu) || []).length;
  return { score: Math.min(100, claims * 22), finding: `${claims} marcador(es) explicativo(s) de argumento.`, advice: 'Demonstre relações causais com raciocínio, não apenas por conectivos.' };
});

Vessie.registerMetric('competence.evidence', 'competências', 'Sustentação de argumentos', ({ normalized }) => {
  const hits = /\b(segundo|dados|pesquisa|estudo|lei|artigo|exemplo|caso)\b/u.test(normalized);
  return { score: hits ? 85 : 35, finding: hits ? 'Marcador de evidência encontrado.' : 'Evidência não reconhecida por padrões.', advice: 'Verifique a confiabilidade e explique a relação com o argumento.' };
});

Vessie.registerMetric('competence.cohesion', 'competências', 'Competência de coesão', ({ normalized }) => {
  const count = (normalized.match(/\b(além disso|porém|portanto|assim|contudo|logo|embora|ademais)\b/gu) || []).length;
  return { score: Math.min(100, count * 15), finding: `${count} conectivo(s) frequente(s) reconhecido(s).`, advice: 'Confira a adequação semântica e a ligação referencial, não apenas a quantidade.' };
});

Vessie.registerMetric('competence.intervention-agent', 'competências', 'Intervenção: agente', ({ normalized }) => {
  const has = /\b(estado|governo|ministério|prefeitura|escola|secretaria|organizações|empresas|sociedade civil)\b/u.test(normalized);
  return { score: has ? 100 : 25, finding: has ? 'Possível agente identificado.' : 'Agente da ação não identificado por padrões.', advice: 'Na conclusão, explicite quem realizará a medida.' };
});

Vessie.registerMetric('competence.intervention-action', 'competências', 'Intervenção: ação', ({ normalized }) => {
  const has = /\b(deve|devem|implementar|promover|criar|ampliar|garantir|oferecer|fiscalizar)\b/u.test(normalized);
  return { score: has ? 90 : 20, finding: has ? 'Verbo de ação possível detectado.' : 'Ação não identificada.', advice: 'Indique uma ação concreta e exequível, não apenas uma intenção genérica.' };
});

Vessie.registerMetric('competence.intervention-means', 'competências', 'Intervenção: meio', ({ normalized }) => {
  const has = /\b(por meio de|mediante|com o uso de|através de|mediante a)\b/u.test(normalized);
  return { score: has ? 100 : 25, finding: has ? 'Meio de execução possivelmente indicado.' : 'Meio de execução não identificado.', advice: 'Explique como a ação será realizada e quais instrumentos serão usados.' };
});

Vessie.registerMetric('competence.intervention-purpose', 'competências', 'Intervenção: finalidade', ({ normalized }) => {
  const has = /\b(a fim de|para que|com o objetivo de|visando|com vistas a)\b/u.test(normalized);
  return { score: has ? 100 : 25, finding: has ? 'Finalidade possivelmente explicitada.' : 'Finalidade não identificada.', advice: 'Diga qual mudança concreta se espera alcançar.' };
});

Vessie.registerMetric('competence.intervention-detail', 'competências', 'Intervenção: detalhamento', ({ normalized }) => {
  const has = /\b(como|por exemplo|especialmente|prioritariamente|por meio de|em parceria com)\b/u.test(normalized);
  return { score: has ? 80 : 30, finding: has ? 'Possível detalhamento encontrado.' : 'Detalhamento não reconhecido.', advice: 'Acrescente público prioritário, etapa ou exemplo operacional.' };
});

Vessie.registerMetric('writing.word-range', 'estrutura', 'Faixa de extensão', ({ words }) => {
  const score = words.length >= 150 && words.length <= 650 ? 100 : words.length < 150 ? Math.min(80, words.length / 2) : Math.max(20, 100 - (words.length - 650) / 8);
  return { score, finding: `${words.length} palavras; faixa apenas indicativa de prática.`, advice: words.length < 150 ? 'Desenvolva os argumentos sem preencher com repetições.' : words.length > 650 ? 'Verifique o limite definido pela proposta.' : '' };
});

Vessie.registerMetric('writing.paragraph-size', 'estrutura', 'Extensão de parágrafos', ({ paragraphs }) => {
  if (!paragraphs.length) return { score: 0, finding: 'Texto vazio.', advice: '' };
  const counts = paragraphs.map(part => part.split(/\s+/u).filter(Boolean).length);
  const outside = counts.filter(count => count < 15 || count > 180).length;
  return { score: Math.max(0, 100 - outside * 18), finding: `${outside} parágrafo(s) fora da faixa ampla de 15–180 palavras.`, advice: 'Use as métricas como alerta, não como regra rígida.' };
});

Vessie.registerMetric('writing.conclusion', 'estrutura', 'Fechamento', ({ paragraphs, normalized }) => {
  const last = paragraphs.at(-1)?.toLocaleLowerCase('pt-BR') || '';
  const conclusion = /\b(portanto|assim|em síntese|dessa forma|por fim|logo)\b/u.test(last);
  const proposal = /\b(deve|devem|por meio de|a fim de|para que)\b/u.test(last);
  return { score: (conclusion ? 50 : 0) + (proposal ? 50 : 0), finding: `Conclusão: ${conclusion ? 'marcador' : 'sem marcador'}; proposta: ${proposal ? 'possível' : 'não detectada'}.`, advice: 'Confira se a conclusão responde ao problema e respeita direitos humanos.' };
});

Vessie.registerMetric('writing.paragraph-openers', 'estrutura', 'Aberturas de parágrafo', ({ paragraphs }) => {
  const starters = paragraphs.map(part => (part.toLowerCase().match(/^[\p{L}]+/u) || [''])[0]);
  const duplicateCount = starters.length - new Set(starters).size;
  return { score: Math.max(0, 100 - duplicateCount * 25), finding: `${duplicateCount} abertura(s) repetida(s).`, advice: duplicateCount ? 'Revise aberturas idênticas em sequência.' : '' };
});

Vessie.registerMetric('writing.cliches', 'estrutura', 'Clichês argumentativos', ({ normalized }) => {
  const hits = (normalized.match(/\b(desde os primordios|na sociedade atual|nos dias de hoje|é de conhecimento geral|fechar com chave de ouro)\b/gu) || []).length;
  return { score: Math.max(0, 100 - hits * 25), finding: `${hits} expressão(ões) previsível(is) do catálogo.`, advice: hits ? 'Prefira contextualização específica e pertinente ao tema.' : '' };
});

Vessie.registerMetric('writing.thesis-position', 'estrutura', 'Posicionamento', ({ paragraphs }) => {
  const intro = (paragraphs[0] || '').toLocaleLowerCase('pt-BR');
  const has = /\b(defende-se|é necessário|é preciso|constitui|deve|torna-se|problema)\b/u.test(intro);
  return { score: has ? 85 : 30, finding: has ? 'Posicionamento provável no início.' : 'Posicionamento não reconhecido por palavras-chave.', advice: 'A tese deve responder diretamente ao tema e antecipar o caminho argumentativo.' };
});

Vessie.registerMetric('writing.argument-count', 'estrutura', 'Sinais de argumentos distintos', ({ normalized }) => {
  const markers = ['em primeiro lugar', 'além disso', 'por outro lado', 'outro fator', 'em segundo lugar', 'ademais'].filter(marker => normalized.includes(marker));
  return { score: Math.min(100, markers.length * 30), finding: `${markers.length} marcador(es) de organização argumentativa.`, advice: 'Desenvolva argumentos distintos; marcadores sozinhos não demonstram progressão.' };
});

Vessie.registerMetric('writing.human-rights', 'estrutura', 'Proposta compatível com direitos', ({ normalized }) => {
  const harmful = /\b(eliminar|expulsar|censurar todos|retirar direitos|punir sem julgamento)\b/u.test(normalized);
  return { score: harmful ? 0 : 100, finding: harmful ? 'Termo potencialmente incompatível com direitos detectado; revise o contexto.' : 'Nenhum marcador de violação de direitos detectado por palavras-chave.', advice: 'Leia criticamente a proposta: o filtro lexical não substitui avaliação de direitos humanos.' };
});

Vessie.registerMetric('writing.proofreading', 'estrutura', 'Revisão de superfície', ({ text }) => {
  const doubles = (text.match(/\b([\p{L}]{3,})\s+\1\b/giu) || []).length;
  const spaces = (text.match(/ {2,}/gu) || []).length;
  const repeatedPunctuation = (text.match(/[!?]{2,}/gu) || []).length;
  const issues = doubles + spaces + repeatedPunctuation;
  return { score: Math.max(0, 100 - issues * 20), finding: `${doubles} duplicação(ões), ${spaces} espaço(s) duplo(s), ${repeatedPunctuation} pontuação(ões) repetida(s).`, advice: issues ? 'Faça uma revisão final; a checagem automática não substitui correção ortográfica.' : '' };
});

/* ── VESSIEOS IFRAME GAME MODE ─────────────────────────────── */
const GameMode = {
  current: GameCatalog.vessieOS,
  loaded: false,

  watch(frame) {
    frame.onload = () => {
      if (this.loaded) {
        const status = UI.$('[data-game-status]');
        if (status) status.textContent = `${this.current.title} carregado no iframe.`;
      }
    };
  },

  open() {
    const frame = UI.$('[data-game-frame]');
    if (!frame) {
      const err = 'A área de jogo não está disponível na interface.';
      Logger.err(`🎮 ${err}`);
      return { ok: false, err };
    }

    UI.setTab('game-mode');
    this.watch(frame);
    if (!this.loaded) {
      this.loaded = true;
      frame.src = this.current.url;
    }
    const status = UI.$('[data-game-status]');
    if (status) status.textContent = `Abrindo ${this.current.title}…`;
    Logger.info(`🎮 Abrindo ${this.current.title} em iframe.`);
    return { ok: true, url: this.current.url };
  },

  close() {
    const frame = UI.$('[data-game-frame]');
    if (!frame) return { ok: false, err: 'A área de jogo não está disponível na interface.' };
    this.loaded = false;
    frame.src = 'about:blank';
    const status = UI.$('[data-game-status]');
    if (status) status.textContent = 'Jogo fechado.';
    return { ok: true };
  },

  reload() {
    const frame = UI.$('[data-game-frame]');
    if (!frame) return { ok: false, err: 'A área de jogo não está disponível na interface.' };
    this.loaded = true;
    this.watch(frame);
    frame.src = this.current.url;
    const status = UI.$('[data-game-status]');
    if (status) status.textContent = `Recarregando ${this.current.title}…`;
    return { ok: true, url: this.current.url };
  },

  openInNewTab() {
    const opened = window.open(this.current.url, '_blank');
    if (!opened) {
      Logger.warn('🎮 O navegador bloqueou a nova aba. Permita pop-ups ou use o link do modo de jogo.');
      return { ok: false, err: 'popup_blocked' };
    }
    opened.opener = null;
    return { ok: true, url: this.current.url };
  }
};

/* ── 23. MODAL ─────────────────────────────────────────────── */
function modal({ title, message, input = null, okText = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'rs-overlay';
    ov.innerHTML = `<div class="rs-modal"><div class="rs-modal-title">${Utils.esc(title)}</div>
      ${message ? `<div class="rs-modal-msg">${Utils.esc(message)}</div>` : ''}
      ${input !== null ? `<input class="rs-input" value="${Utils.esc(input)}"/>` : ''}
      <div class="rs-modal-actions"><button class="rs-btn" data-a="no">Cancelar</button>
      <button class="rs-btn ${danger ? 'rs-danger' : 'rs-primary'}" data-a="yes">${Utils.esc(okText)}</button></div></div>`;
    UI.root.appendChild(ov);
    const inp = UI.$('.rs-input', ov); if (inp) { inp.focus(); inp.select(); }
    const close = v => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && inp) close(inp.value); };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(null); });
    UI.$('[data-a="no"]', ov).onclick = () => close(null);
    UI.$('[data-a="yes"]', ov).onclick = () => close(inp ? inp.value.trim() : true);
  });
}

/* ── 24. UI ────────────────────────────────────────────────── */
const UI = {
  host: null, root: null, tab: 'editor', minimized: false,
  _spawnBroadcast: true, _saveTimer: null, _anTimer: null, _tick: null,

  $: (s, r = UI.root) => r.querySelector(s),
  $$: (s, r = UI.root) => [...r.querySelectorAll(s)],

  mount() {
    this.host = document.createElement('div');
    this.host.id = PANEL_ID;
    const sh = this.host.attachShadow({ mode: 'open' });
    this.root = sh;
    sh.innerHTML = this._styles() + this._html();
    document.body.appendChild(this.host);
    this.bindUI();
    this.reloadSettings();
    const box = this.$('.rs-app');
    box.style.left = Math.max(10, innerWidth - 500) + 'px';
    box.style.top = '70px';
    if (Store.data.settings.autosave && Store.data.autoText) this.$('.rs-editor').value = Store.data.autoText;
    if (Store.data.notes) this.$('[data-notes]').value = Store.data.notes;
    this.fillConnectives();
    this.renderCheck();
    this.detectAll();
    this.updateCounters();
    this.renderDrafts();
    this._refreshSpawnUI();
    this._refreshAutoUI();
    this._updateStatus();
    Snap.init();
    this._tick = setInterval(() => { if (!QuillTyper.running) this.detectAll(true); }, 4000);
    this._statusIv = setInterval(() => this._updateStatus(), 3000);
    document.addEventListener('keydown', this._esc = e => {
      if (e.key === 'Escape' && UI.$('.vessie-command-overlay')) return;
      if (e.key === 'Escape' && UI.$('[data-vessie-desktop]')?.classList.contains('rs-on')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        VessieDesktop.exit();
        return;
      }
      if (e.key === 'Escape' && !this.minimized) this.setMin(true);
    }, true);
  },

  destroy() {
    try {
      Store.data.autoText = this.$('.rs-editor')?.value || '';
      Store.data.notes = this.$('[data-notes]')?.value || '';
      Store.save();
    } catch {}
    if (Focus.running) Focus.stop(false);
    try { VessieStudio.destroy(); } catch (e) { Logger.warn(`Vessie: limpeza incompleta (${e.message}).`); }
    try { VessieDesktop.destroy(); } catch (e) { Logger.warn(`Desktop: limpeza incompleta (${e.message}).`); }
    clearInterval(this._tick); clearInterval(this._statusIv);
    document.removeEventListener('keydown', this._esc, true);
    this.host?.remove();
    window.__rsInstance = null;
    Logger.info('✍️ Studio fechado.');
  },

  /* ── STYLES ── */
  _styles() {
    return `<style>
      :host{all:initial}
      *{box-sizing:border-box;margin:0;padding:0}
      .rs-app,.rs-toast,.rs-overlay{font-family:system-ui,'Segoe UI',Roboto,sans-serif;font-size:13px;color:var(--tx)}
      .rs-app{
        --bg:#0f1220; --panel:#161a2b; --panel2:#1e2338; --panel3:#262c46;
        --tx:#e8ebf4; --tx2:#8b93a7; --bd:#2d3450; --bd2:#3a4462;
        --ac:#7c5cff; --ac2:#9b83ff; --ac3:#5a3fd6;
        --ok:#22c55e; --warn:#ffb547; --err:#ff4d6d; --gold:#ffd93d; --info:#4dabf7; --accent:#ff6b9d;
        position:fixed;width:500px;max-width:96vw;max-height:94vh;display:flex;flex-direction:column;
        z-index:2147483646;background:var(--panel);border:1px solid var(--bd);border-radius:14px;
        box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 0 1px rgba(124,92,255,.15);overflow:hidden;
      }
      .rs-app[data-theme="light"]{
        --bg:#eef0f6; --panel:#fff; --panel2:#f4f6fb; --panel3:#e8ecf5;
        --tx:#1a1d29; --tx2:#667085; --bd:#dfe3ee; --bd2:#cdd3e0;
      }
      .rs-game-frame{display:block;width:100%;height:min(58vh,520px);min-height:280px;border:1px solid var(--bd);border-radius:10px;background:#fff}
      .rs-prog{height:3px;background:var(--bg);position:relative;flex:none}
      .rs-prog i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--ok);transition:width .15s}
      .rs-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(135deg,var(--ac),var(--ac3));color:#fff;cursor:grab;user-select:none;flex:none}
      .rs-title{font-weight:700;font-size:13.5px;flex:1;letter-spacing:.3px}
      .rs-badge{font-size:9px;background:rgba(255,255,255,.18);padding:2px 6px;border-radius:4px;font-weight:600}
      .rs-head button{background:rgba(255,255,255,.14);border:0;color:#fff;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:13px}
      .rs-head button:hover{background:rgba(255,255,255,.3)}
      .rs-tabs{display:flex;background:var(--bg);border-bottom:1px solid var(--bd);flex:none;overflow-x:auto;scrollbar-width:none}
      .rs-tabs::-webkit-scrollbar{display:none}
      .rs-tabs button{flex:0 0 auto;background:none;border:0;color:var(--tx2);padding:9px 10px;cursor:pointer;font-size:15px;border-bottom:2px solid transparent;font-family:inherit;transition:.15s;line-height:1}
      .rs-tabs button:hover{color:var(--tx);background:var(--panel2)}
      .rs-tabs button.rs-on{color:var(--ac2);border-bottom-color:var(--ac2)}
      .rs-tabs button.rs-on.rs-tab-spawn{color:var(--gold);border-bottom-color:var(--gold)}
      .rs-tabs button.rs-on.rs-tab-auto{color:var(--ok);border-bottom-color:var(--ok)}
      .rs-tabs button.rs-on.rs-tab-ia{color:var(--gold);border-bottom-color:var(--gold)}
      .rs-app{transition:width .25s ease,height .25s ease,left .25s ease,top .25s ease}
      .rs-app.rs-full{left:0!important;top:0!important;width:100vw!important;max-width:100vw!important;height:100vh!important;max-height:100vh!important;height:100dvh!important;max-height:100dvh!important;border-radius:0!important;box-shadow:none!important}
      .rs-app.rs-full .rs-body{padding:14px 16px}
      .rs-app.rs-full textarea.rs-editor{min-height:38vh;font-size:13.5px}
      .rs-app.rs-nomenu .rs-tabs{display:none!important}
      .rs-out{white-space:pre-wrap;background:var(--panel2);border:1px solid var(--bd);border-radius:8px;padding:8px;max-height:220px;overflow:auto;font-size:12px}
      .rs-out[data-err="1"]{border-color:var(--err)}
      .rs-tabs button.rs-on.rs-tab-redacao{color:var(--accent);border-bottom-color:var(--accent)}
      .rs-body{padding:10px 12px;overflow-y:auto;flex:1}
      .rs-pane{display:none;flex-direction:column;gap:8px}
      .rs-pane.rs-on{display:flex}
      .rs-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .rs-status-pills{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px}
      .rs-pill{padding:3px 8px;border-radius:6px;background:var(--panel2);border:1px solid var(--bd);font-size:10px;font-weight:600;transition:.2s}
      .rs-pill.rs-on{color:var(--ok);border-color:var(--ok)}
      .rs-pill.rs-off{color:var(--err);border-color:var(--err);opacity:.6}
      .rs-pill.rs-warn{color:var(--warn);border-color:var(--warn)}
      select.rs-mode,.rs-input{background:var(--panel2);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:7px 9px;font-size:12.5px;outline:none;width:100%;font-family:inherit;min-width:0}
      select.rs-mode:focus,.rs-input:focus{border-color:var(--ac)}
      textarea.rs-input{resize:vertical;line-height:1.5}
      textarea.rs-editor{width:100%;min-height:170px;max-height:38vh;background:var(--panel2);border:1px solid var(--bd);border-radius:10px;color:var(--tx);padding:10px;font:12.5px/1.55 ui-monospace,Consolas,monospace;resize:vertical;outline:none}
      textarea.rs-editor:focus{border-color:var(--ac)}
      .rs-count{display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--tx2);font-size:11px}
      .rs-count b{color:var(--tx)}
      .rs-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      .rs-actions-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}
      .rs-btn{background:var(--panel2);border:1px solid var(--bd);color:var(--tx);padding:8px 10px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:600;font-family:inherit;transition:.15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rs-btn:hover{border-color:var(--ac);transform:translateY(-1px)}
      .rs-btn:active{transform:translateY(0) scale(.98)}
      .rs-btn.rs-primary{background:var(--ac);border-color:var(--ac);color:#fff}
      .rs-btn.rs-primary:hover{background:var(--ac2);border-color:var(--ac2)}
      .rs-btn.rs-danger{border-color:var(--err);color:var(--err)}
      .rs-btn.rs-danger:hover{background:var(--err);color:#fff}
      .rs-btn.rs-gold{border-color:var(--gold);color:var(--gold)}
      .rs-btn.rs-gold:hover{background:var(--gold);color:#2a2100}
      .rs-btn.rs-ok{border-color:var(--ok);color:var(--ok)}
      .rs-btn.rs-ok:hover{background:var(--ok);color:#0a0a15}
      .rs-btn.rs-accent{border-color:var(--accent);color:var(--accent)}
      .rs-btn.rs-accent:hover{background:var(--accent);color:#fff}
      .rs-btn:disabled{opacity:.45;cursor:not-allowed}
      .rs-list{display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto}
      .rs-list-sm{max-height:150px}
      .rs-item{background:var(--panel2);border:1px solid var(--bd);border-radius:9px;padding:8px 10px;display:flex;gap:8px;align-items:center}
      .rs-meta{flex:1;min-width:0}
      .rs-name{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rs-sub{color:var(--tx2);font-size:11px;margin-top:2px}
      .rs-empty{color:var(--tx2);text-align:center;padding:18px 8px;font-size:12px;border:1px dashed var(--bd);border-radius:10px;line-height:1.7}
      .rs-set{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--panel2);border:1px solid var(--bd);border-radius:10px;padding:10px}
      .rs-set label{font-size:12.5px;font-weight:600}
      .rs-set small{display:block;color:var(--tx2);font-weight:400;margin-top:2px;font-size:11px}
      input[type=range]{accent-color:var(--ac);width:130px}
      .rs-switch{position:relative;width:38px;height:21px;flex:none}
      .rs-switch input{opacity:0;position:absolute;inset:0;cursor:pointer;margin:0;z-index:1}
      .rs-switch i{position:absolute;inset:0;background:var(--bd);border-radius:20px;transition:.2s}
      .rs-switch i::before{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;top:3px;left:3px;transition:.2s}
      .rs-switch input:checked+i{background:var(--ok)}
      .rs-switch input:checked+i::before{transform:translateX(17px)}
      .rs-card{background:var(--panel2);border:1px solid var(--bd);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px}
      .rs-kv{display:flex;gap:8px;font-size:12px}
      .rs-kv b{color:var(--ac2);flex:none;min-width:92px;font-weight:600}
      .rs-kv span{color:var(--tx);word-break:break-word}
      .rs-bar{height:8px;background:var(--bg);border:1px solid var(--bd);border-radius:6px;overflow:hidden}
      .rs-bar i{display:block;height:100%;width:0;background:var(--ok);transition:width .3s,background .3s}
      .rs-chip{display:inline-flex;align-items:center;gap:5px;background:var(--panel2);border:1px solid var(--bd);border-radius:20px;padding:3px 9px;font-size:11px;color:var(--tx2)}
      .rs-chips{display:flex;flex-wrap:wrap;gap:4px}
      .rs-chip.rs-click{cursor:pointer}
      .rs-chip.rs-click:hover{border-color:var(--ac);color:var(--ac2)}
      .rs-chip.rs-done{border-color:var(--ok);color:var(--ok)}
      .rs-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
      .rs-stat{background:var(--panel2);border:1px solid var(--bd);border-radius:9px;padding:8px 4px;text-align:center}
      .rs-stat b{display:block;font-size:15px;color:var(--ac2)}
      .rs-stat span{font-size:10px;color:var(--tx2)}
      .rs-warn{color:var(--tx2);font-size:11.5px;line-height:1.7;word-break:break-word}
      .rs-warn strong{color:var(--ac2)}
      .rs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:2147483647}
      .rs-modal{background:var(--panel);border:1px solid var(--bd);border-radius:14px;padding:16px;width:320px;max-width:90vw;display:flex;flex-direction:column;gap:10px;box-shadow:0 20px 50px rgba(0,0,0,.5)}
      .rs-modal-title{font-weight:700;font-size:14px}
      .rs-modal-msg{font-size:12.5px;color:var(--tx2);line-height:1.5}
      .rs-modal-actions{display:flex;gap:8px;justify-content:flex-end}
      .rs-toasts{position:fixed;right:18px;bottom:70px;display:flex;flex-direction:column;gap:8px;z-index:2147483647;max-width:320px}
      .rs-toast{background:var(--panel);border:1px solid var(--bd);border-left:4px solid var(--ac);color:var(--tx);padding:10px 14px;border-radius:10px;font-size:12.5px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.4);opacity:0;transform:translateX(12px);transition:.25s}
      .rs-toast.rs-on{opacity:1;transform:none}
      .rs-toast.rs-ok{border-left-color:var(--ok)}
      .rs-toast.rs-err{border-left-color:var(--err)}
      .rs-toast.rs-warn{border-left-color:var(--warn)}
      .rs-pill-min{position:fixed;right:18px;bottom:18px;display:none;align-items:center;gap:8px;background:var(--ac);color:#fff;border:0;border-radius:30px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.45);z-index:2147483646;font-family:inherit}
      .rs-console{background:#05050a;border:1px solid var(--bd);border-radius:8px;height:180px;overflow-y:auto;font-family:'Consolas','Monaco',monospace;font-size:10.5px;padding:6px;line-height:1.5;user-select:text}
      .rs-app[data-theme="light"] .rs-console{background:#f4f6fb;color:#1a1d29}
      .rs-log-entry{margin-bottom:2px;word-break:break-word;padding:2px 4px;border-radius:3px;border-left:2px solid transparent}
      .rs-log-entry.rs-info{color:#7bd6b8;border-left-color:var(--ok)}
      .rs-log-entry.rs-warn{color:var(--warn);background:rgba(255,181,71,.07);border-left-color:var(--warn)}
      .rs-log-entry.rs-error{color:var(--err);background:rgba(255,77,109,.08);border-left-color:var(--err)}
      .rs-log-entry.rs-success{color:var(--ok);background:rgba(34,197,94,.08);border-left-color:var(--ok)}
      .rs-log-entry.rs-out{color:var(--info);border-left-color:var(--info)}
      .rs-log-entry.rs-in{color:var(--accent);border-left-color:var(--accent)}
      .rs-log-entry .rs-log-time{color:var(--tx2);font-size:9.5px;margin-right:4px}
      .rs-stars-row{display:flex;gap:4px;margin-bottom:6px}
      .rs-star-btn{flex:1;padding:8px 4px;background:var(--panel2);border:1px solid var(--bd);border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;transition:.15s;color:var(--tx);font-family:inherit;text-align:center;line-height:1}
      .rs-star-btn:hover{border-color:var(--gold);background:var(--panel3)}
      .rs-star-btn.rs-on{background:linear-gradient(135deg,var(--gold),#f0a500);color:#2a2100;border-color:var(--gold)}
      .rs-score-row{display:flex;align-items:center;gap:6px;background:var(--panel2);padding:6px 8px;border-radius:6px;border:1px solid var(--bd);margin-bottom:6px}
      .rs-score-row label{font-size:10px;color:var(--tx2);font-weight:600;text-transform:uppercase}
      .rs-score-row input{flex:1;background:var(--bg);border:1px solid var(--bd);color:var(--gold);font-family:'Consolas',monospace;font-size:12px;padding:4px 8px;border-radius:4px;font-weight:bold;text-align:center;outline:none}
      .rs-score-row input:focus{border-color:var(--gold)}
      .rs-score-row button{background:var(--panel3);border:1px solid var(--bd);color:var(--tx);padding:3px 7px;border-radius:4px;cursor:pointer;font-size:10px;font-family:inherit}
      .rs-score-row button:hover{background:var(--ac);border-color:var(--ac);color:#fff}
      .rs-banner-gold{background:rgba(255,217,61,.12);border:1px solid var(--gold);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--gold);line-height:1.5}
      .rs-banner-warn{background:rgba(255,181,71,.12);border:1px solid var(--warn);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--warn);line-height:1.5}
      .rs-banner-info{background:rgba(77,171,247,.12);border:1px solid var(--info);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--info);line-height:1.5}
      .rs-section{background:var(--panel2);border:1px solid var(--bd);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px}
      .rs-section-title{font-size:10.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--warn);font-weight:700;display:flex;justify-content:space-between;align-items:center}
      .rs-section-title .rs-badge-sm{font-size:9.5px;color:var(--tx2);font-weight:500;text-transform:none;letter-spacing:0}
      .rs-url-status{font-size:9.5px;padding:2px 6px;border-radius:3px;font-family:monospace}
      .rs-url-status.rs-ok{background:rgba(34,197,94,.14);color:var(--ok)}
      .rs-url-status.rs-no{background:rgba(255,77,109,.14);color:var(--err)}
      .rs-cfg-row{display:flex;align-items:center;gap:6px}
      .rs-cfg-row label{font-size:10px;color:var(--tx2);font-weight:600;min-width:70px;text-transform:uppercase}
      .rs-cfg-row input{flex:1;background:var(--bg);border:1px solid var(--bd);color:var(--tx);font-family:monospace;font-size:10.5px;padding:5px 7px;border-radius:5px;outline:none}
      .rs-cfg-row input:focus{border-color:var(--ac)}
      .rs-ep-item{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;border-bottom:1px solid rgba(45,52,80,.4);cursor:pointer}
      .rs-ep-item:hover{background:var(--panel3)}
      .rs-ep-item .rs-ep-idx{color:var(--ac);font-weight:bold;min-width:22px}
      .rs-ep-item .rs-ep-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx);font-size:11px}
      .rs-ep-item .rs-ep-state{font-size:9px;padding:1px 5px;border-radius:3px;background:var(--panel3);color:var(--tx2)}
      .rs-body::-webkit-scrollbar,.rs-list::-webkit-scrollbar,.rs-console::-webkit-scrollbar{width:8px}
      .rs-body::-webkit-scrollbar-thumb,.rs-list::-webkit-scrollbar-thumb,.rs-console::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:4px}
      .rs-hint{font-size:10px;color:var(--tx2);font-style:italic;line-height:1.4}
      .rs-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    </style>`;
  },

  /* ── HTML ── */
  _html() {
    return `
      <div class="rs-app" data-theme="dark">
        <div class="rs-prog"><i></i></div>
        <div class="rs-head">
          <span>🎮✍️</span>
          <span class="rs-title">STUDIO ULTIMATE</span>
          <span class="rs-badge">v6.0</span>
          <button data-act="full" title="Tela cheia (F)">⛶</button>
          <button data-act="theme" title="Tema">🌓</button>
          <button data-act="min" title="Minimizar (Esc)">─</button>
          <button data-act="close" title="Fechar">✕</button>
        </div>
        <div class="rs-tabs">
          <button data-tab="editor" class="rs-on" title="Editor">📝</button>
          <button data-tab="analyze" title="Análise">📊</button>
          <button data-tab="platform" title="Plataforma">🔬</button>
          <button data-tab="drafts" title="Salvos">💾</button>
          <button data-tab="focus" title="Foco">⏱</button>
          <button data-tab="ia" class="rs-tab-ia" title="IA — melhorar e criar texto">🤖</button>
          <button data-tab="matific" class="rs-tab-matific" title="Matific">⚡</button>
          <button data-tab="spawn" class="rs-tab-spawn" title="Spawn Finish">🌌</button>
          <button data-tab="auto" class="rs-tab-auto" title="Auto-complete">🚀</button>
          <button data-tab="game-mode" class="rs-tab-game" title="Modo de jogo">🎮</button>
          <button data-tab="spy" title="Spy">🕵️</button>
          <button data-tab="debug" title="Debug">🛠</button>
          <button data-tab="logs" title="Logs">📋</button>
          <button data-tab="settings" title="Ajustes">⚙️</button>
        </div>
        <div class="rs-body">
          <!-- ══ EDITOR ══ -->
          <div class="rs-pane rs-on" data-pane="editor">
            <div class="rs-row">
              <span class="rs-chip" data-show="engine">🔎 detectando…</span>
              <button class="rs-btn" data-act="detect" style="flex:none;padding:5px 10px" title="Re-detectar">⟳</button>
              <button class="rs-btn" data-act="copy" style="flex:none;padding:5px 10px" title="Copiar texto">📋</button>
            </div>
            <textarea class="rs-editor" placeholder="Escreva ou cole seu texto aqui…&#10;Ctrl+Enter = inserir · Ctrl+S = salvar rascunho"></textarea>
            <div class="rs-count"></div>
            <div class="rs-row">
              <select class="rs-input" data-conn style="flex:1"><option value="">➕ Inserir conectivo…</option></select>
              <button class="rs-btn" data-act="insertConn" style="flex:none;padding:5px 10px">OK</button>
            </div>
            <select class="rs-mode">
              <option value="replace">🔄 Substituir todo o editor</option>
              <option value="paste">📥 Colar nativo (evento paste)</option>
              <option value="cursor">✒️ Inserir na posição do cursor</option>
            </select>
            <div class="rs-actions">
              <button class="rs-btn rs-primary" data-act="insert">⚡ Inserir agora</button>
              <button class="rs-btn" data-act="type">⌨️ Digitar gradual</button>
              <button class="rs-btn" data-act="paste">📋 Colar da área</button>
              <button class="rs-btn" data-act="pull">⬆️ Puxar do editor</button>
              <button class="rs-btn" data-act="saveDraft">💾 Salvar rascunho</button>
              <button class="rs-btn" data-act="ia-melhorar">🤖 Melhorar (IA)</button>
              <button class="rs-btn rs-danger" data-act="clear">🧹 Limpar editor</button>
            </div>
          </div>

          <!-- ══ ANALYZE ══ -->
          <div class="rs-pane" data-pane="analyze">
            <div class="rs-stats" data-box="stats"></div>
            <div class="rs-card"><div class="rs-kv"><b>🔗 Conectivos</b></div><div class="rs-warn" data-box="conns"></div></div>
            <div class="rs-card"><div class="rs-kv"><b>🔤 Frequentes</b></div><div class="rs-chips" data-box="freq"></div></div>
            <div class="rs-card"><div class="rs-kv"><b>⚠️ Alertas</b></div><div class="rs-warn" data-box="alerts"></div></div>
            <div class="rs-set"><label>🧠 Planejamento<small>Tese e argumentos — salvo automaticamente</small></label></div>
            <textarea class="rs-input" data-notes style="min-height:80px" placeholder="Tese: …&#10;Argumento 1: …&#10;Argumento 2: …"></textarea>
            <div class="rs-chips">
              <span class="rs-chip rs-click" data-check="intro" data-label="Introdução com tese">⬜ Introdução com tese</span>
              <span class="rs-chip rs-click" data-check="d1" data-label="Desenvolvimento 1">⬜ Desenvolvimento 1</span>
              <span class="rs-chip rs-click" data-check="d2" data-label="Desenvolvimento 2">⬜ Desenvolvimento 2</span>
              <span class="rs-chip rs-click" data-check="conc" data-label="Conclusão + proposta">⬜ Conclusão + proposta</span>
            </div>
          </div>

          <!-- ══ PLATFORM ══ -->
          <div class="rs-pane" data-pane="platform">
            <div class="rs-card" data-box="proposal"></div>
            <div class="rs-bar"><i data-bar></i></div>
            <div class="rs-set"><label>📊 Progresso<small data-show="guard">—</small></label></div>
            <div class="rs-set"><label>🧮 Comparativo<small data-show="compare">—</small></label></div>
          </div>

          <!-- ══ DRAFTS ══ -->
          <div class="rs-pane" data-pane="drafts">
            <div class="rs-row"><input class="rs-input rs-draft-name" placeholder="Nome do rascunho (opcional)"/></div>
            <div class="rs-list" data-list="drafts"></div>
            <div class="rs-set"><label>📸 Snapshots<small data-show="snapInfo">Cópias automáticas do texto</small></label></div>
            <div class="rs-list rs-list-sm" data-list="snaps"></div>
            <div class="rs-list rs-list-sm" data-list="history"></div>
          </div>

          <!-- ══ FOCUS ══ -->
          <div class="rs-pane" data-pane="focus">
            <div class="rs-card" style="align-items:center;text-align:center">
              <div style="font-size:30px;font-weight:700;color:var(--ac2)" data-show="clock">00:00</div>
              <div class="rs-row" style="justify-content:center">
                <button class="rs-btn rs-primary" data-act="focus">▶ Iniciar / ⏹ Parar</button>
                <button class="rs-btn" data-act="focusReset">Descartar</button>
              </div>
              <div class="rs-warn" data-show="focusTotal">Total: 0 min</div>
            </div>
            <div class="rs-list" data-list="sessions"></div>
          </div>

          <!-- ══ IA ══ -->
          <div class="rs-pane" data-pane="ia">
            <div class="rs-row" style="justify-content:space-between">
              <div class="rs-section-title">🤖 Assistente de IA</div>
              <span class="rs-badge-sm" data-ia-status>LM Studio: …</span>
            </div>
            <div class="rs-set"><label>💬 Pedido<small>O texto do editor é enviado junto (vazio = só o editor)</small></label></div>
            <textarea class="rs-input" data-ia-prompt style="min-height:56px" placeholder="Ex.: crie uma tese sobre desigualdade…"></textarea>
            <div class="rs-actions">
              <button class="rs-btn" data-act="ia-melhorar">✨ Melhorar</button>
              <button class="rs-btn" data-act="ia-continuar">➡️ Continuar</button>
              <button class="rs-btn" data-act="ia-tese">💡 Tese</button>
              <button class="rs-btn" data-act="ia-argumentos">🧩 Argumentos</button>
              <button class="rs-btn" data-act="ia-intervencao">🛠️ Intervenção</button>
              <button class="rs-btn" data-act="ia-gramatica">📝 Gramática</button>
              <button class="rs-btn" data-act="ia-feedback">📊 Feedback ENEM</button>
              <button class="rs-btn" data-act="ia-grade">🎯 Estimar nota</button>
            </div>
            <div class="rs-out" data-ia-out data-err="0">Abra a aba 🤖 e rode um comando.</div>
            <div class="rs-grid-2">
              <button class="rs-btn rs-primary" data-act="ia-insert">⬇ Inserir no editor</button>
              <button class="rs-btn" data-act="ia-clear">🧹 Limpar saída</button>
            </div>
          </div>

          <!-- ══ GAME MODE ══ -->
          <div class="rs-pane" data-pane="game-mode">
            <div class="rs-row" style="justify-content:space-between">
              <div class="rs-section-title">🎮 ${GameCatalog.vessieOS.title}</div>
              <span class="rs-warn" data-game-status>Pronto para abrir.</span>
            </div>
            <div class="rs-grid-2">
              <button class="rs-btn rs-primary" data-act="gameModeOpen">▶ Abrir jogo</button>
              <button class="rs-btn" data-act="gameModeReload">⟳ Recarregar</button>
              <button class="rs-btn rs-danger" data-act="gameModeClose">■ Fechar</button>
              <a class="rs-btn" href="${GameCatalog.vessieOS.url}" target="_blank" rel="noopener noreferrer" style="text-align:center;text-decoration:none">↗ Abrir em nova aba</a>
            </div>
            <iframe class="rs-game-frame" data-game-frame title="${GameCatalog.vessieOS.title}" loading="lazy" allow="fullscreen"></iframe>
            <div class="rs-banner-info">Se o site não aparecer incorporado, ele pode bloquear iframes pelo navegador ou por cabeçalhos de segurança. Use “Abrir em nova aba”.</div>
          </div>

          <!-- ══ MATIFIC ══ -->
          <div class="rs-pane" data-pane="matific">
            <div class="rs-status-pills">
              <span class="rs-pill rs-off" data-pill="unity">Unity: ?</span>
              <span class="rs-pill rs-off" data-pill="iframe">Iframes: ?</span>
              <span class="rs-pill rs-off" data-pill="url">URL: ?</span>
              <span class="rs-pill rs-off" data-pill="token">Token: ?</span>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">⚡ Episode Control <span class="rs-badge-sm">1-5⭐ · score editável</span></div>
              <div class="rs-stars-row" data-stars-row="matific">
                <button class="rs-star-btn" data-stars="1">1⭐</button>
                <button class="rs-star-btn" data-stars="2">2⭐</button>
                <button class="rs-star-btn" data-stars="3">3⭐</button>
                <button class="rs-star-btn" data-stars="4">4⭐</button>
                <button class="rs-star-btn rs-on" data-stars="5">5⭐</button>
              </div>
              <div class="rs-score-row">
                <label>Score</label>
                <input type="number" data-score-input="matific" value="2500" min="0" max="999999" step="50">
                <button type="button" data-score-auto="matific">auto</button>
              </div>
              <button class="rs-btn rs-ok" style="width:100%;padding:9px" data-act="finish" data-btn="finish">⚡ Finish (5⭐ · 2500 pts)</button>
              <div class="rs-grid-2" style="margin-top:6px">
                <button class="rs-btn rs-danger" data-act="abort">Abort</button>
                <button class="rs-btn" data-act="skipLoading">Force Ready</button>
                <button class="rs-btn" data-act="resetState">Reset State</button>
                <button class="rs-btn" data-act="firstInteraction">1st Interaction</button>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">🔊 Audio</div>
              <div class="rs-grid-2">
                <button class="rs-btn" data-act="mute" data-args='[true]'>🔇 Mute</button>
                <button class="rs-btn" data-act="mute" data-args='[false]'>🔊 Unmute</button>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">📤 Raw JSON</div>
              <textarea class="rs-input" data-raw placeholder='{"type":"FinishEpisode","stars":5,"score":2500}'></textarea>
              <button class="rs-btn rs-ok" style="width:100%;margin-top:5px" data-act="sendRaw">Send to All</button>
            </div>
          </div>

          <!-- ══ SPAWN ══ -->
          <div class="rs-pane" data-pane="spawn">
            <div class="rs-banner-gold">
              🌌 <b>SPAWN FINISH</b> — força conclusão <b>SEM abrir</b> iframe.<br>
              Envia facts direto ao <code>/addFacts</code> do scoring service.
            </div>
            <div class="rs-section">
              <div class="rs-section-title">⚙ Configuração <span class="rs-badge-sm">auto-detectável</span></div>
              <div class="rs-cfg-row"><label>Scoring URL</label><input type="text" data-spawn="url" placeholder="https://prod-scoringservice.matific.com/"/></div>
              <div class="rs-cfg-row"><label>user_token</label><input type="text" data-spawn="token" placeholder="(auto cookie)"/></div>
              <div class="rs-row" style="margin-top:5px">
                <span class="rs-url-status rs-no" data-spawn-status="url">URL: —</span>
                <span class="rs-url-status rs-no" data-spawn-status="token">Token: —</span>
                <button class="rs-btn rs-primary" data-act="spawn-detect" style="flex:none;padding:4px 8px;font-size:11px">🔍 Auto</button>
                <button class="rs-btn rs-ok" data-act="spawn-save" style="flex:none;padding:4px 8px;font-size:11px">💾</button>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">🎯 Parâmetros <span class="rs-badge-sm">1-5⭐ · score editável</span></div>
              <div class="rs-stars-row" data-stars-row="spawn">
                <button class="rs-star-btn" data-stars="1">1⭐</button>
                <button class="rs-star-btn" data-stars="2">2⭐</button>
                <button class="rs-star-btn" data-stars="3">3⭐</button>
                <button class="rs-star-btn" data-stars="4">4⭐</button>
                <button class="rs-star-btn rs-on" data-stars="5">5⭐</button>
              </div>
              <div class="rs-score-row">
                <label>Score</label>
                <input type="number" data-score-input="spawn" value="2500" min="0" max="999999" step="50">
                <button type="button" data-score-auto="spawn">auto</button>
              </div>
              <div class="rs-grid-2">
                <button class="rs-btn rs-gold" data-act="scanEpisodes">🔎 Scan Episódios</button>
                <button class="rs-btn rs-primary" data-act="spawn-test">🧪 Testar</button>
              </div>
              <div class="rs-list rs-list-sm" data-list="spawn-eps" style="margin-top:6px;max-height:150px">
                <div class="rs-empty" style="padding:10px">Clique em "Scan Episódios" primeiro</div>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">💥 Spawn em Massa</div>
              <div class="rs-grid-2">
                <button class="rs-btn rs-gold" data-act="spawn-all-finish">🌌 Finish</button>
                <button class="rs-btn rs-accent" data-act="spawn-all-sequence">🎬 Sequence</button>
              </div>
              <div class="rs-set" style="margin-top:6px;padding:6px 8px">
                <label style="font-size:11px">Broadcast → Unity</label>
                <span class="rs-switch"><input type="checkbox" data-set="spawnBroadcast"><i></i></span>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">🖊 Spawn Custom</div>
              <input class="rs-input" data-spawn-custom placeholder="slug1, slug2, slug3..."/>
              <div class="rs-grid-2" style="margin-top:5px">
                <button class="rs-btn rs-gold" data-act="spawn-custom-finish">🌌 Finish</button>
                <button class="rs-btn rs-accent" data-act="spawn-custom-sequence">🎬 Sequence</button>
              </div>
              <div class="rs-hint" style="margin-top:4px">Slugs extraídos dos cards do mapa.</div>
            </div>
          </div>

          <!-- ══ AUTO ══ -->
          <div class="rs-pane" data-pane="auto">
            <div class="rs-banner-warn">⚠ AUTO abre cada episódio fisicamente. Use 🌌 SPAWN para não abrir.</div>
            <div class="rs-section">
              <div class="rs-section-title">🎯 Auto-Complete</div>
              <div class="rs-stars-row" data-stars-row="auto">
                <button class="rs-star-btn" data-stars="1">1⭐</button>
                <button class="rs-star-btn" data-stars="2">2⭐</button>
                <button class="rs-star-btn" data-stars="3">3⭐</button>
                <button class="rs-star-btn" data-stars="4">4⭐</button>
                <button class="rs-star-btn rs-on" data-stars="5">5⭐</button>
              </div>
              <div class="rs-score-row">
                <label>Score</label>
                <input type="number" data-score-input="auto" value="2500" min="0" max="999999" step="50">
                <button type="button" data-score-auto="auto">auto</button>
              </div>
              <div class="rs-row" style="margin-bottom:6px">
                <label style="font-size:11px;color:var(--tx2)">Delay:</label>
                <select class="rs-input" data-auto-delay style="flex:1">
                  <option value="500">500ms</option>
                  <option value="800" selected>800ms</option>
                  <option value="1500">1500ms</option>
                  <option value="2500">2500ms</option>
                </select>
              </div>
              <div class="rs-grid-2">
                <button class="rs-btn rs-gold" data-act="queueFromScan">📋 Enfileirar</button>
                <button class="rs-btn rs-ok" data-act="runAutoComplete">🚀 Executar</button>
                <button class="rs-btn rs-danger" data-act="stopAutoComplete">⏹ Parar</button>
                <button class="rs-btn rs-accent" data-act="openAllAndComplete">⚡ Fluxo Completo</button>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">🔓 Unlock de Níveis</div>
              <div class="rs-grid-2">
                <button class="rs-btn rs-gold" data-act="unlockAllLevels">🔓 Unlock Local</button>
                <button class="rs-btn rs-primary" data-act="unlockInFirebase">☁ Firebase</button>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">👁 Watcher</div>
              <div class="rs-set" style="padding:6px 8px">
                <label style="font-size:11px">Auto-Finish em EpisodeReady</label>
                <span class="rs-switch"><input type="checkbox" data-watcher><i></i></span>
              </div>
            </div>
          </div>

          <!-- ══ SPY ══ -->
          <div class="rs-pane" data-pane="spy">
            <div class="rs-section">
              <div class="rs-section-title">🕵️ Event Spy <span class="rs-badge-sm" data-show="spy-count">0</span></div>
              <div class="rs-set" style="padding:6px 8px">
                <label style="font-size:11px">Spy Ativo</label>
                <span class="rs-switch"><input type="checkbox" data-set="spyEnabled"><i></i></span>
              </div>
              <div class="rs-grid-2" style="margin-top:5px">
                <button class="rs-btn rs-primary" data-act="copyEvents">Copy</button>
                <button class="rs-btn rs-primary" data-act="exportEvents">Export</button>
                <button class="rs-btn rs-danger" data-act="clearEvents">Clear</button>
                <button class="rs-btn rs-gold" data-act="injectSpyHook">Inject</button>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">📡 Events</div>
              <div class="rs-console" id="rs-events"></div>
            </div>
          </div>

          <!-- ══ DEBUG ══ -->
          <div class="rs-pane" data-pane="debug">
            <div class="rs-section">
              <div class="rs-section-title">🔍 Diagnóstico</div>
              <div class="rs-grid-2">
                <button class="rs-btn rs-primary" data-act="scanBridges">Scan Bridges</button>
                <button class="rs-btn rs-primary" data-act="dumpState">Dump State</button>
                <button class="rs-btn rs-primary" data-act="spawn-scan-perf">Scan Perf</button>
                <button class="rs-btn rs-gold" data-act="spawn-list-captured">URLs Capturadas</button>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-section-title">💉 Inject JS</div>
              <textarea class="rs-input" data-inject placeholder="// Código no contexto dos iframes"></textarea>
              <button class="rs-btn rs-gold" style="width:100%;margin-top:5px" data-act="injectFromInput">Inject All</button>
            </div>
          </div>

          <!-- ══ LOGS ══ -->
          <div class="rs-pane" data-pane="logs">
            <div class="rs-section">
              <div class="rs-section-title">📋 Logs <span class="rs-badge-sm" data-show="log-count">0</span></div>
              <div class="rs-grid-2">
                <button class="rs-btn rs-primary" data-act="exportLogs">Export</button>
                <button class="rs-btn rs-danger" data-act="clearLogs">Clear</button>
              </div>
            </div>
            <div class="rs-section">
              <div class="rs-console" id="rs-log" style="height:380px"></div>
            </div>
          </div>

          <!-- ══ SETTINGS ══ -->
          <div class="rs-pane" data-pane="settings">
            <div class="rs-set"><label>🌙 Tema escuro</label><span class="rs-switch"><input type="checkbox" data-set="dark"><i></i></span></div>
            <div class="rs-set"><label>⌨️ Velocidade<small><b data-show="speed"></b> por unidade</small></label><input type="range" min="1" max="80" data-set="speed"></div>
            <div class="rs-set"><label>🔤 Granularidade<small>Unidade inserida por passo</small></label>
              <select class="rs-input" data-set="grain" style="width:110px"><option value="word">Palavra</option><option value="char">Letra</option><option value="phrase">Frase</option></select></div>
            <div class="rs-set"><label>🗣️ Pausa na pontuação</label><span class="rs-switch"><input type="checkbox" data-set="pausePunct"><i></i></span></div>
            <div class="rs-set"><label>💾 Auto-salvar</label><span class="rs-switch"><input type="checkbox" data-set="autosave"><i></i></span></div>
            <div class="rs-set"><label>🎯 Meta de palavras<small>Progresso quando não há proposta</small></label>
              <input type="number" class="rs-input" data-set="goal" style="width:80px"></div>
            <div class="rs-set"><label>📸 Snapshot automático<small>Minutos entre cópias (0 = off)</small></label>
              <input type="number" class="rs-input" data-set="snapEvery" style="width:80px"></div>
            <div class="rs-set"><label>🔠 Fonte do editor<small><b data-show="font"></b> px</small></label>
              <input type="range" min="10" max="18" step="0.5" data-set="fontSize"></div>
            <div class="rs-set"><label>🎯 Limites manuais<small>Usados só se a proposta não for detectada</small></label>
              <span class="rs-row">mín <input type="number" class="rs-input" data-set="min" style="width:64px"> máx <input type="number" class="rs-input" data-set="max" style="width:64px"></span></div>
            <div class="rs-actions">
              <button class="rs-btn" data-act="export">⬇️ Backup .json</button>
              <button class="rs-btn" data-act="import">⬆️ Importar</button>
              <button class="rs-btn" data-act="exportTxt">📄 Exportar .txt</button>
              <button class="rs-btn rs-danger" data-act="reset">🚨 Reset total</button>
            </div>
            <input type="file" accept=".json,.txt" class="rs-file" style="display:none">
          </div>
        </div>
        <div class="rs-toasts"></div>
      </div>
      <button class="rs-pill-min">✍️ <span>Studio</span></button>`;
  },

  /* ── EVENT BINDING ── */
  bindUI() {
    // Tabs
    this.$$('.rs-tabs button').forEach(b => b.onclick = () => b.dataset.tab === 'game-mode' ? GameMode.open() : this.setTab(b.dataset.tab));

    // Click delegation
    this.root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b) { e.stopPropagation(); const args = b.dataset.args ? JSON.parse(b.dataset.args) : []; this.action(b.dataset.act, b, args); return; }
      const s = e.target.closest('[data-stars]');
      if (s) { this._selectStars(s); return; }
      const sa = e.target.closest('[data-score-auto]');
      if (sa) { this._autoScore(sa.dataset.scoreAuto); return; }
      const ch = e.target.closest('[data-check]');
      if (ch) { const k = ch.dataset.check; Store.data.checklist[k] = !Store.data.checklist[k]; Store.save(); this.renderCheck(); return; }
    });

    // Editor
    const ed = this.$('.rs-editor');
    ed.addEventListener('input', () => { this.updateCounters(); this.autosave(); this.queueAnalyze(); });
    ed.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); this.insertNow(); }
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); this.saveDraft(); }
    });

    // Notes
    this.$('[data-notes]').addEventListener('input', e => { Store.data.notes = e.target.value; this.autosave(); });

    // Settings
    const set = (key, val, ev = 'input') => {
      const el = this.$(`[data-set="${key}"]`); if (!el) return;
      el.addEventListener(ev, e => {
        const v = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'number' || e.target.type === 'range' ? +e.target.value || 0 : e.target.value);
        Store.data.settings[key] = v; Store.save();
        this._applySetting(key, v);
      });
    };
    set('dark', null, 'change'); set('speed', null); set('grain', null, 'change');
    set('pausePunct', null, 'change'); set('autosave', null, 'change');
    set('goal', null); set('snapEvery', null); set('fontSize', null);
    set('min', null); set('max', null);
    set('spawnBroadcast', null, 'change'); set('spyEnabled', null, 'change');

    // Score inputs
    this.$$('[data-score-input]').forEach(inp => inp.addEventListener('input', () => this._updateFinishBtn()));

    // Spawn config
    this.$('[data-spawn="url"]').addEventListener('change', e => { SpawnFinish.baseUrl = e.target.value.trim(); this._refreshSpawnUI(); });
    this.$('[data-spawn="token"]').addEventListener('change', e => { SpawnFinish.token = e.target.value.trim(); this._refreshSpawnUI(); });

    // Watcher
    this.$('[data-watcher]').addEventListener('change', e => {
      const stars = this._getStars('auto'); const score = +this.$('[data-score-input="auto"]').value || null;
      AutoCompleter.watchAutoFinish(stars, e.target.checked, score);
    });

    // File import
    this.$('.rs-file').addEventListener('change', e => { if (e.target.files[0]) this.importData(e.target.files[0]); e.target.value = ''; });

    // Minimize pill
    this.$('.rs-pill-min').onclick = () => this.setMin(false);

    // Drag
    this.bindDrag(this.$('.rs-head'), this.$('.rs-app'));

    // Modal overlay dismiss
    document.addEventListener('keydown', this._esc, true);
  },

  bindDrag(h, b) {
    let sx, sy, ox, oy, d = false;
    h.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      d = true; h.setPointerCapture(e.pointerId);
      const r = b.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; e.preventDefault();
    });
    h.addEventListener('pointermove', e => {
      if (!d) return;
      b.style.left = Math.min(Math.max(0, ox + e.clientX - sx), innerWidth - 60) + 'px';
      b.style.top = Math.min(Math.max(0, oy + e.clientY - sy), innerHeight - 40) + 'px';
    });
    h.addEventListener('pointerup', () => d = false);
  },

  _selectStars(btn) {
    const row = btn.closest('[data-stars-row]');
    const rowId = row.dataset.starsRow;
    row.querySelectorAll('[data-stars]').forEach(x => x.classList.toggle('rs-on', x === btn));
    const stars = +btn.dataset.stars;
    const scoreInput = this.$(`[data-score-input="${rowId}"]`);
    if (scoreInput) scoreInput.value = CFG.starScoreMap[stars] ?? 2500;
    if (rowId === 'matific') this._updateFinishBtn();
  },

  _autoScore(rowId) {
    const stars = this._getStars(rowId);
    const inp = this.$(`[data-score-input="${rowId}"]`);
    if (inp) inp.value = CFG.starScoreMap[stars] ?? 2500;
    if (rowId === 'matific') this._updateFinishBtn();
  },

  _getStars(rowId) {
    const row = this.$(`[data-stars-row="${rowId}"]`);
    if (!row) return 5;
    const active = row.querySelector('[data-stars].rs-on');
    return active ? +active.dataset.stars : 5;
  },

  _updateFinishBtn() {
    const stars = this._getStars('matific');
    const score = +this.$('[data-score-input="matific"]').value || 0;
    const btn = this.$('[data-btn="finish"]');
    if (btn) btn.textContent = `⚡ Finish (${stars}⭐ · ${score} pts)`;
  },

  _applySetting(key, v) {
    if (key === 'dark') this.applyTheme();
    if (key === 'speed') { const s = this.$('[data-show="speed"]'); if (s) s.textContent = v + ' ms'; }
    if (key === 'fontSize') { const ed = this.$('.rs-editor'); if (ed) ed.style.fontSize = v + 'px'; const f = this.$('[data-show="font"]'); if (f) f.textContent = v; }
    if (key === 'spyEnabled') Spy.enabled = v;
    if (key === 'min' || key === 'max' || key === 'goal') this.renderPlatform();
  },

  setTab(t) {
    this.tab = t;
    this.$$('.rs-tabs button').forEach(b => b.classList.toggle('rs-on', b.dataset.tab === t));
    this.$$('.rs-pane').forEach(p => p.classList.toggle('rs-on', p.dataset.pane === t));
    if (t === 'platform') this.detectAll();
    if (t === 'drafts') this.renderDrafts();
    if (t === 'analyze') this.renderAnalyze();
    if (t === 'focus') this.renderFocus();
    if (t === 'ia') this.renderIaStatus();
    if (t === 'spawn') this._refreshSpawnUI();
    if (t === 'auto') this._refreshAutoUI();
  },

  setMin(v) { this.minimized = v; this.$('.rs-app').style.display = v ? 'none' : 'flex'; this.$('.rs-pill-min').style.display = v ? 'flex' : 'none'; },

  applyTheme() { this.$('.rs-app').dataset.theme = Store.data.settings.dark ? 'dark' : 'light'; },

  reloadSettings() {
    const s = Store.data.settings;
    const setVal = (k, v) => { const el = this.$(`[data-set="${k}"]`); if (!el) return; el.type === 'checkbox' ? el.checked = v : el.value = v; };
    ['dark','speed','grain','pausePunct','autosave','min','max','goal','snapEvery','fontSize','spawnBroadcast','spyEnabled'].forEach(k => setVal(k, s[k]));
    this.$('[data-show="speed"]').textContent = s.speed + ' ms';
    this.$('[data-show="font"]').textContent = s.fontSize;
    this.$('.rs-editor').style.fontSize = s.fontSize + 'px';
    this.applyTheme();
    Spy.enabled = s.spyEnabled !== false;
    this._spawnBroadcast = s.spawnBroadcast !== false;
  },

  /* ── EDITOR ── */
  setText(t) { this.$('.rs-editor').value = t; this.updateCounters(); this.queueAnalyze(); this.autosave(); },
  updateCounters() {
    const t = this.$('.rs-editor').value, w = CountSync.words(t);
    this.$('.rs-count').innerHTML =
      `<span><b>${CountSync.chars(t)}</b> caracteres</span>` +
      `<span><b>${w}</b> palavras</span><span><b>${t ? t.split('\n').length : 0}</b> linhas</span>` +
      `<span><b>${t.trim() ? t.trim().split(/\n\s*\n+/).filter(p => p.trim()).length : 0}</b> parágrafos</span>` +
      `<span>📖 ~${Math.ceil(w / 200)} min</span>`;
    const pill = this.$('.rs-pill-min span');
    if (pill) pill.textContent = w ? `${w} palavras` : 'Studio';
  },
  queueAnalyze() { clearTimeout(this._anTimer); this._anTimer = setTimeout(() => { if (this.tab === 'analyze') this.renderAnalyze(); }, 400); },
  autosave(force) {
    if (!Store.data.settings.autosave && !force) return;
    clearTimeout(this._saveTimer);
    const s = () => { Store.data.autoText = this.$('.rs-editor').value; Store.save(); };
    force ? s() : this._saveTimer = setTimeout(s, 700);
  },
  insertStudio(text) {
    const ed = this.$('.rs-editor'); const s = ed.selectionStart ?? ed.value.length, e = ed.selectionEnd ?? s;
    ed.value = ed.value.slice(0, s) + text + ed.value.slice(e);
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.focus(); ed.selectionStart = ed.selectionEnd = s + text.length;
  },
  fillConnectives() {
    const sel = this.$('[data-conn]'); if (!sel) return;
    sel.innerHTML = '<option value="">➕ Inserir conectivo…</option>' +
      Object.entries(Analyzer.CONNECTIVES).map(([c, ws]) =>
        `<optgroup label="${Utils.esc(c)}">${ws.map(w => `<option value="${Utils.esc(w)}">${Utils.esc(w)}</option>`).join('')}</optgroup>`).join('');
  },
  renderCheck() {
    Store.data.checklist = Store.data.checklist || {};
    this.$$('[data-check]').forEach(ch => {
      const on = !!Store.data.checklist[ch.dataset.check];
      ch.classList.toggle('rs-done', on);
      ch.textContent = (on ? '✅ ' : '⬜ ') + ch.dataset.label;
    });
  },
  renderAnalyze() {
    const t = this.$('.rs-editor')?.value || '';
    const s = Analyzer.stats(t);
    const st = this.$('[data-box="stats"]'); if (!st) return;
    st.innerHTML = [['Palavras', s.words], ['Únicas', s.unique], ['Diversidade', s.diversity + '%'],
      ['Frases', s.sentences], ['Média/frase', s.avgSent], ['Parágrafos', s.paragraphs],
      ['Caracteres', s.chars], ['Leitura', s.readingMin + ' min'], ['Fala', s.speakingMin + ' min']]
      .map(([l, v]) => `<div class="rs-stat"><b>${v}</b><span>${l}</span></div>`).join('');
    const c = Analyzer.connectives(t);
    this.$('[data-box="conns"]').innerHTML = Object.entries(c).map(([cat, list]) =>
      `<div><strong>${Utils.esc(cat)}:</strong> ${list.length ? Utils.esc(list.join(', ')) : '<i>nenhum ainda</i>'}</div>`).join('');
    this.$('[data-box="freq"]').innerHTML = Analyzer.freq(t).map(([w, n]) =>
      `<span class="rs-chip">${Utils.esc(w)} <b style="color:var(--ac2)">${n}</b></span>`).join('') || '<span class="rs-chip">—</span>';
    const long = Analyzer.longSentences(t), rep = Analyzer.repeats(t), alerts = [];
    if (long.length) alerts.push(`${long.length} frase(s) muito longa(s) (&gt;45 palavras) — considere dividir.`);
    if (rep.length) alerts.push(`Repetições próximas: ${Utils.esc(rep.join(', '))}.`);
    const { min, max } = this.limits();
    if (max && s.words > max) alerts.push(`Acima do máximo (${s.words}/${max}).`);
    if (min && s.words < min) alerts.push(`Abaixo do mínimo (${s.words}/${min}).`);
    this.$('[data-box="alerts"]').innerHTML = alerts.length ? alerts.map(a => '• ' + a).join('<br>') : '✅ Nenhum alerta.';
  },
  limits() { const p = this.proposal || {}; return { min: p.min || Store.data.settings.min, max: p.max || Store.data.settings.max }; },
  detectAll(silent) {
    const k = QuillBridge.detect();
    if (!silent || this.tab === 'platform') this.renderPlatform();
    const label = { quill: '🟢 Quill nativo', dom: '🟡 Quill (DOM)', textarea: '🔵 textarea', editable: '🔵 editável', none: '🔴 nenhum' }[k];
    const e = this.$('[data-show="engine"]'); if (e) e.textContent = label;
    return k !== 'none';
  },
  renderPlatform() {
    this.proposal = FiberLens.findProposal();
    const box = this.$('[data-box="proposal"]'); if (!box) return;
    const p = this.proposal, { min, max } = this.limits(), goal = Store.data.settings.goal;
    box.innerHTML = p
      ? `<div class="rs-kv"><b>Tema</b><span>${Utils.esc(p.tema) || '—'}</span></div>
        <div class="rs-kv"><b>Gênero</b><span>${Utils.esc(p.genero) || '—'}</span></div>
        <div class="rs-kv"><b>Série</b><span>${Utils.esc(p.serie) || '—'}</span></div>
        <div class="rs-kv"><b>Limites</b><span>${min || '?'} – ${max || '?'} palavras</span></div>
        <div class="rs-kv"><b>Motivadores</b><span>${p.motivadores} texto(s)</span></div>
        <div class="rs-kv"><b>Proposta</b><span>#${p.idProposta ?? '—'}</span></div>
        <div class="rs-kv"><b>Enunciado</b><span style="color:var(--tx2)">${Utils.esc(p.enunciado) || '—'}</span></div>`
      : `<div class="rs-empty">Proposta não detectada.<br>Abra a página da redação e clique em ⟳.</div>`;
    const pw = CountSync.words(QuillBridge.read()), sw = CountSync.words(this.$('.rs-editor').value);
    const cmp = this.$('[data-show="compare"]');
    if (cmp) cmp.textContent = `Editor da página: ${pw} palavras · Studio: ${sw} palavras`;
    WordGuard.paint(pw, min, max, goal);
  },

  /* ── DRAFTS/SNAPSHOTS ── */
  renderDrafts() {
    const db = this.$('[data-list="drafts"]'), hb = this.$('[data-list="history"]'), sb = this.$('[data-list="snaps"]');
    const ds = Store.data.drafts;
    db.innerHTML = ds.length ? '' : '<div class="rs-empty">Nenhum rascunho. Escreva e use 💾.</div>';
    ds.forEach(d => {
      const it = document.createElement('div'); it.className = 'rs-item';
      it.innerHTML = `<div class="rs-meta"><div class="rs-name">${Utils.esc(d.name)}</div>
        <div class="rs-sub">${d.words} palavras · ${Utils.fmtDate(d.date)}</div></div>`;
      const o = document.createElement('button'); o.className = 'rs-btn rs-primary'; o.style.padding = '5px 10px'; o.textContent = 'Abrir';
      o.onclick = () => { this.setText(d.text); this.setTab('editor'); };
      const x = document.createElement('button'); x.className = 'rs-btn rs-danger'; x.style.padding = '5px 10px'; x.textContent = '✕';
      x.onclick = () => { Store.data.drafts = Store.data.drafts.filter(y => y.id !== d.id); Store.save(); this.renderDrafts(); };
      it.append(o, x); db.appendChild(it);
    });
    const ss = Store.data.snapshots || [];
    sb.innerHTML = ss.length ? '' : '<div class="rs-empty" style="padding:10px">Sem snapshots.</div>';
    ss.forEach(s => {
      const it = document.createElement('div'); it.className = 'rs-item';
      it.innerHTML = `<div class="rs-meta"><div class="rs-name">📸 ${s.words} palavras</div>
        <div class="rs-sub">${Utils.fmtDate(s.date)}</div></div>`;
      const o = document.createElement('button'); o.className = 'rs-btn rs-primary'; o.style.padding = '5px 10px'; o.textContent = 'Restaurar';
      o.onclick = () => { this.setText(s.text); this.setTab('editor'); Logger.ok('📸 Snapshot restaurado.'); };
      const x = document.createElement('button'); x.className = 'rs-btn rs-danger'; x.style.padding = '5px 10px'; x.textContent = '✕';
      x.onclick = () => { Store.data.snapshots = Store.data.snapshots.filter(y => y !== s); Store.save(); this.renderDrafts(); };
      it.append(o, x); sb.appendChild(it);
    });
    const hs = Store.data.history;
    hb.innerHTML = hs.length ? '' : '<div class="rs-empty" style="padding:10px">Sem histórico.</div>';
    hs.forEach(h => {
      const it = document.createElement('div'); it.className = 'rs-item';
      it.innerHTML = `<div class="rs-meta"><div class="rs-name">${Utils.esc(h.text.slice(0, 50))}…</div>
        <div class="rs-sub">${h.words} palavras · ${h.mode} · ${Utils.fmtDate(h.date)}</div></div>`;
      const o = document.createElement('button'); o.className = 'rs-btn rs-primary'; o.style.padding = '5px 10px'; o.textContent = 'Abrir';
      o.onclick = () => { this.setText(h.full || h.text); this.setTab('editor'); };
      it.append(o); hb.appendChild(it);
    });
  },

  /* ── FOCUS ── */
  renderFocus() {
    this.tickFocus();
    const ft = this.$('[data-show="focusTotal"]');
    if (ft) ft.textContent = `Total: ${Focus.totalMins()} min em ${Store.data.sessions.length} sessão(ões)`;
    const list = this.$('[data-list="sessions"]'); if (!list) return;
    const ss = Store.data.sessions;
    list.innerHTML = ss.length ? '' : '<div class="rs-empty">Nenhuma sessão ainda.</div>';
    ss.forEach(s => {
      const it = document.createElement('div'); it.className = 'rs-item';
      it.innerHTML = `<div class="rs-meta"><div class="rs-name">${s.mins} min de foco</div>
        <div class="rs-sub">${Utils.fmtDate(s.date)} · ${s.words} palavras</div></div>`;
      list.appendChild(it);
    });
  },
  tickFocus() { const c = this.$('[data-show="clock"]'); if (c) c.textContent = Focus.fmt(Focus.elapsed()); },

  /* ── SPAWN ── */
  _refreshSpawnUI() {
    const urlInput = this.$('[data-spawn="url"]');
    const tokenInput = this.$('[data-spawn="token"]');
    const urlStatus = this.$('[data-spawn-status="url"]');
    const tokenStatus = this.$('[data-spawn-status="token"]');
    if (urlInput && !urlInput.value) urlInput.value = SpawnFinish.baseUrl;
    if (tokenInput && !tokenInput.value && SpawnFinish.token) tokenInput.value = SpawnFinish.token;
    if (urlStatus) {
      urlStatus.textContent = `URL: ${SpawnFinish.detectedBaseUrl ? '✓ auto' : (SpawnFinish._customUrl ? '✓ custom' : '• default')}`;
      urlStatus.className = 'rs-url-status ' + (SpawnFinish.baseUrl ? 'rs-ok' : 'rs-no');
    }
    if (tokenStatus) {
      const has = !!SpawnFinish.token;
      tokenStatus.textContent = `Token: ${has ? '✓ ' + SpawnFinish.token.slice(0, 6) + '…' : '✗ não'}`;
      tokenStatus.className = 'rs-url-status ' + (has ? 'rs-ok' : 'rs-no');
    }
    const list = this.$('[data-list="spawn-eps"]');
    if (!list) return;
    const all = EpisodeScanner.getAll();
    if (!all.length) {
      list.innerHTML = '<div class="rs-empty" style="padding:10px">Nenhum episódio. Clique em "Scan Episódios".</div>';
      return;
    }
    list.innerHTML = all.map((ep, i) => {
      const slug = SpawnFinish.extractSlug(ep.el) || ep.slug || ep.id || '—';
      return `<div class="rs-ep-item"><span class="rs-ep-idx">#${i + 1}</span>
        <span class="rs-ep-name" title="${Utils.esc(slug)}">${Utils.esc(Utils.truncate(slug, 45))}</span>
        <span class="rs-ep-state">ready</span></div>`;
    }).join('');
  },

  /* ── AUTO ── */
  _refreshAutoUI() {
    // Auto UI has no list, just stats in memory - no dynamic UI update needed here since it uses log
  },

  /* ── STATUS ── */
  _updateStatus() {
    const set = (id, txt, on, cls = 'rs-on') => {
      const el = this.$(`[data-pill="${id}"]`); if (!el) return;
      el.textContent = txt; el.className = 'rs-pill ' + (on ? cls : 'rs-off');
    };
    const u = !!window.unityInstance?.Module?.SendMessage;
    const i = IframeBridge._allIframes().length;
    set('unity', `Unity: ${u ? '✓' : '✗'}`, u);
    set('iframe', `Iframes: ${i}`, i > 0);
    set('url', `URL: ${SpawnFinish.baseUrl ? '✓' : '✗'}`, !!SpawnFinish.baseUrl);
    set('token', `Token: ${SpawnFinish.token ? '✓' : '✗'}`, !!SpawnFinish.token, 'rs-warn');
    this._refreshSpawnUI();
  },

  /* ── LOGS ── */
  appendLog(entry) {
    const logEl = this.$('#rs-log'); if (!logEl) return;
    const div = document.createElement('div');
    div.className = `rs-log-entry rs-${entry.type}`;
    div.innerHTML = `<span class="rs-log-time">[${entry.t}]</span>${Utils.esc(entry.msg)}`;
    logEl.appendChild(div);
    while (logEl.children.length > CFG.maxLog) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
    const c = this.$('[data-show="log-count"]');
    if (c) c.textContent = logEl.children.length;
  },
  appendEvent(evt) {
    const el = this.$('#rs-events'); if (!el) return;
    const div = document.createElement('div');
    const cls = evt.dir === 'IN←' ? 'rs-in' : evt.dir === 'UNITY→' ? 'rs-out' : 'rs-info';
    div.className = `rs-log-entry ${cls}`;
    const sym = evt.dir === 'IN←' ? '←' : evt.dir === 'OUT→' ? '→' : '⚡';
    div.innerHTML = `<span class="rs-log-time">[${evt.t}]</span><b>${sym} ${Utils.esc(evt.type)}</b>`;
    el.appendChild(div);
    while (el.children.length > CFG.maxEvents) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
    this.updateSpyCount();
  },
  updateSpyCount() {
    const c = this.$('[data-show="spy-count"]');
    if (c) c.textContent = Spy.events.length;
  },

  /* ── ACTIONS ── */
  ensure() {
    QuillBridge.detect();
    if (QuillBridge.kind() === 'none') { Logger.err('Nenhum editor detectado.'); return false; }
    return true;
  },
  async checkLimits(text) {
    const w = CountSync.words(text), { min, max } = this.limits();
    const g = WordGuard.check(w, min, max);
    if (g.level !== 'ok') return await modal({ title: 'Fora dos limites', message: g.msg + '. Inserir mesmo assim?', okText: 'Inserir', danger: g.level === 'err' });
    return true;
  },

  async insertNow() {
    if (QuillTyper.running) { Logger.err('Digitação em andamento.'); return; }
    const text = this.$('.rs-editor').value;
    if (!text.trim()) { Logger.err('Editor do Studio vazio.'); return; }
    if (!this.ensure()) return;
    if (!await this.checkLimits(text)) return;
    const mode = this.$('.rs-mode').value;
    let ok = mode === 'paste' ? !!QuillBridge.pasteNative(text)
      : mode === 'replace' ? QuillBridge.replaceAll(text)
      : QuillBridge.insertAtCursor(text);
    if (!ok) { Logger.err('Falha ao inserir.'); return; }
    this.log(text, mode); this.autosave(true);
    Logger.ok(`✅ ${CountSync.words(text)} palavras entregues (${mode}).`);
  },

  async insertTyped(btn) {
    if (QuillTyper.running) { QuillTyper.stop(); return; }
    const text = this.$('.rs-editor').value;
    if (!text.trim()) { Logger.err('Editor vazio.'); return; }
    if (!this.ensure()) return;
    if (!await this.checkLimits(text)) return;
    btn.textContent = '⏹ Parar'; btn.classList.add('rs-danger');
    const prog = this.$('.rs-prog i');
    const done = await QuillTyper.run(text, { ...Store.data.settings, mode: this.$('.rs-mode').value === 'cursor' ? 'cursor' : 'replace' }, p => prog.style.width = (p * 100) + '%');
    prog.style.width = '0'; btn.textContent = '⌨️ Digitar gradual'; btn.classList.remove('rs-danger');
    if (done) { this.log(text, 'typed'); this.autosave(true); Logger.ok('✅ Digitação concluída!'); }
    else Logger.info('Interrompida.');
  },

  async pasteClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) { Logger.info('Área de transferência vazia.'); return; }
      this.insertStudio(t); Logger.ok('📋 Colado.');
    } catch { Logger.err('Sem permissão — use Ctrl+V.'); }
  },

  pull() {
    if (!this.ensure()) return;
    const v = QuillBridge.read();
    if (!v.trim()) { Logger.info('Editor da página vazio.'); return; }
    this.setText(v); Logger.ok('⬆️ Texto puxado.');
  },

  log(text, mode) {
    Store.data.history.unshift({ text: text.slice(0, 400), full: text, date: Date.now(), words: CountSync.words(text), mode });
    Store.data.history = Store.data.history.slice(0, 20); Store.save();
    if (this.tab === 'drafts') this.renderDrafts();
  },

  async saveDraft() {
    const text = this.$('.rs-editor').value;
    if (!text.trim()) { Logger.err('Nada para salvar.'); return; }
    const sug = text.trim().split(/\s+/).slice(0, 5).join(' ') + '…';
    const name = await modal({ title: 'Salvar rascunho', input: this.$('.rs-draft-name').value || sug, okText: 'Salvar' });
    if (!name) return;
    Store.data.drafts.unshift({ id: Utils.uid(), name, text, date: Date.now(), words: CountSync.words(text), key: this.proposal?.idProposta ?? 'global' });
    Store.data.drafts = Store.data.drafts.slice(0, 30); Store.save();
    this.$('.rs-draft-name').value = '';
    this.renderDrafts(); Logger.ok(`💾 "${name}" salvo.`);
  },

  importData(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        if (file.name.endsWith('.txt')) { this.setText(r.result); Logger.ok('📄 Texto importado.'); return; }
        const d = JSON.parse(r.result);
        Store.data = { ...Store.data, ...d, settings: { ...Store.data.settings, ...(d.settings || {}) } };
        Store.save(); this.reloadSettings(); this.renderDrafts(); this.renderCheck();
        if (Store.data.notes) this.$('[data-notes]').value = Store.data.notes;
        Logger.ok('⬆️ Importado!');
      } catch { Logger.err('Arquivo inválido.'); }
    };
    r.readAsText(file);
  },

  /* ── IA (LM Studio) ── */
  iaSay(msg, err) {
    const o = this.$('[data-ia-out]');
    if (o) { o.textContent = String(msg ?? ''); o.dataset.err = err ? '1' : '0'; }
  },
  iaBusy(b) { this.$$('[data-pane="ia"] button').forEach(x => { try { x.disabled = !!b; } catch {} }); },
  async renderIaStatus() {
    const el = this.$('[data-ia-status]');
    if (!el) return;
    if (typeof LmClient === 'undefined') { el.textContent = 'LM: extensão ausente'; return; }
    el.textContent = 'LM: verificando…';
    try {
      const s = await LmClient.status();
      el.textContent = s.ok ? `LM: online (${s.models.length})` : 'LM: offline';
    } catch { el.textContent = 'LM: erro'; }
  },
  async iaCmd(id) {
    if (typeof LmRunner === 'undefined') { this.setTab('ia'); this.iaSay('Extensão LM não carregada.', true); return; }
    const prompt = (this.$('[data-ia-prompt]')?.value || '').trim();
    const src = prompt || this.$('.rs-editor').value;
    if (!src.trim()) { Logger.info('Escreva no editor ou no pedido da IA.'); return; }
    this.setTab('ia');
    this.iaBusy(true); this.iaSay('⏳ Consultando o LM Studio…');
    try {
      const r = await LmRunner.run(id, src, {});
      this.iaSay(r.ok ? r.text : ('Falhou: ' + (r.err || '?') + (r.hint ? '\n' + r.hint : '')), !r.ok);
      if (r.ok) Logger.ok('🤖 Resposta pronta na aba IA.');
    } finally { this.iaBusy(false); }
  },
  async iaFeedback(kind) {
    if (typeof RedacaoAI === 'undefined') { this.setTab('ia'); this.iaSay('Extensão LM não carregada.', true); return; }
    const src = this.$('.rs-editor').value;
    if (!src.trim()) { Logger.info('Editor vazio.'); return; }
    this.setTab('ia');
    this.iaBusy(true); this.iaSay('⏳ Consultando o LM Studio…');
    try {
      const r = kind === 'grade' ? await RedacaoAI.gradeEssay(src, {}) : await RedacaoAI.feedback(src, {});
      this.iaSay(r.ok ? (r.text + (r.parsedTotal != null ? `\n\nEstimativa somada: ${r.parsedTotal}` : '')) : ('Falhou: ' + (r.err || '?') + (r.hint ? '\n' + r.hint : '')), !r.ok);
    } finally { this.iaBusy(false); }
  },

  /* ── MASTER ACTION DISPATCHER ── */
  async action(name, btn, args = []) {
    switch (name) {
      /* Redação */
      case 'theme': Store.data.settings.dark = !Store.data.settings.dark; Store.save(); this.$('[data-set="dark"]').checked = Store.data.settings.dark; this.applyTheme(); break;
      case 'min': this.setMin(true); break;
      case 'close': if (await modal({ title: 'Fechar o Studio?', message: 'Rascunhos ficam salvos.', okText: 'Fechar', danger: true })) this.destroy(); break;
      case 'gameModeOpen': GameMode.open(); break;
      case 'gameModeReload': GameMode.reload(); break;
      case 'gameModeClose': GameMode.close(); break;
      case 'detect': this.detectAll(); Logger.ok('🔎 Plataforma re-escaneada.'); break;
      case 'insert': this.insertNow(); break;
      case 'type': this.insertTyped(btn); break;
      case 'paste': this.pasteClipboard(); break;
      case 'pull': this.pull(); break;
      case 'saveDraft': this.saveDraft(); break;
      case 'copy': { const t = this.$('.rs-editor').value; if (!t) { Logger.info('Nada para copiar.'); break; } (await Utils.copyText(t)) ? Logger.ok('📋 Copiado.') : Logger.err('Sem permissão.'); break; }
      case 'insertConn': { const v = this.$('[data-conn]').value; if (!v) { Logger.info('Escolha um conectivo.'); break; } this.insertStudio(v + ', '); this.autosave(); break; }
      case 'focus': Focus.toggle(); break;
      case 'focusReset': Focus.reset(); break;
      case 'full': {
        try {
          if (typeof FullscreenUI !== 'undefined') FullscreenUI.toggleFull();
          else this.$('.rs-app').classList.toggle('rs-full');
        } catch (e) { Logger.err(e.message); }
        break;
      }
      case 'ia-melhorar': this.iaCmd('melhorar'); break;
      case 'ia-continuar': this.iaCmd('continuar'); break;
      case 'ia-tese': this.iaCmd('tese'); break;
      case 'ia-argumentos': this.iaCmd('argumentos'); break;
      case 'ia-intervencao': this.iaCmd('intervencao'); break;
      case 'ia-gramatica': this.iaCmd('gramatica'); break;
      case 'ia-feedback': this.iaFeedback('feedback'); break;
      case 'ia-grade': this.iaFeedback('grade'); break;
      case 'ia-insert': {
        const o = this.$('[data-ia-out]')?.textContent || '';
        if (!o || /^(⏳|Falhou|Abra a aba|Saída limpa|Extensão)/.test(o)) { Logger.info('Nada para inserir.'); break; }
        this.insertStudio(o); Logger.ok('⬇ Resposta da IA no editor.');
        break;
      }
      case 'ia-clear': {
        const o = this.$('[data-ia-out]');
        if (o) { o.textContent = 'Saída limpa.'; o.dataset.err = '0'; }
        const p = this.$('[data-ia-prompt]');
        if (p) p.value = '';
        break;
      }
      case 'clear':
        if (await modal({ title: 'Limpar o editor da página?', okText: 'Limpar', danger: true })) { QuillBridge.replaceAll(''); Logger.ok('🧹 Editor limpo.'); } break;
      case 'export': Utils.download('studio-backup.json', JSON.stringify(Store.data, null, 2)); Logger.ok('⬇️ Exportado.'); break;
      case 'exportTxt': { const t = this.$('.rs-editor').value; if (!t.trim()) { Logger.info('Editor vazio.'); break; } Utils.download('redacao.txt', t, 'text/plain'); Logger.ok('📄 .txt exportado.'); break; }
      case 'import': this.$('.rs-file').click(); break;
      case 'reset':
        if (await modal({ title: 'Resetar o Studio?', message: 'Apaga rascunhos, histórico, snapshots, sessões e ajustes.', okText: 'Apagar tudo', danger: true })) {
          Store.reset(); this.reloadSettings(); this.renderCheck(); this.renderDrafts(); this.renderFocus();
          this.$('.rs-editor').value = ''; if (this.$('[data-notes]')) this.$('[data-notes]').value = '';
          this.updateCounters(); this.renderAnalyze(); Logger.ok('🔄 Tudo resetado.');
        } break;

      /* Matific */
      case 'finish': {
        const stars = this._getStars('matific');
        const score = +this.$('[data-score-input="matific"]').value || null;
        IframeBridge.sendToEpisode(Msg.finishEpisode(stars, score));
        IframeBridge.sendToApp(Msg.finishEpisodeApp(stars, score));
        Logger.ok(`⚡ Finish ${stars}⭐ · ${score} pts`);
        break;
      }
      case 'abort':
        IframeBridge.sendToEpisode(Msg.abortEpisode());
        IframeBridge.sendToApp(Msg.abortEpisodeApp('UserAbort'));
        Logger.warn('Abort');
        break;
      case 'skipLoading': IframeBridge.sendToEpisode(Msg.ready()); IframeBridge.sendToApp(Msg.episodeReady()); break;
      case 'resetState': IframeBridge.sendToEpisode(Msg.startSuspended()); break;
      case 'mute': IframeBridge.sendToEpisode(Msg.muteAudio(args[0])); break;
      case 'firstInteraction': IframeBridge.sendToEpisode(Msg.firstInteraction()); break;
      case 'sendRaw': {
        try { const o = JSON.parse(this.$('[data-raw]').value); IframeBridge.broadcast(o); Logger.ok('📤 Enviado.'); }
        catch (e) { Logger.err(e.message); }
        break;
      }

      /* Spawn */
      case 'scanEpisodes': EpisodeScanner.scan(); this._refreshSpawnUI(); break;
      case 'spawn-detect': {
        URLCapture.scanPerformance();
        try {
          if (!SpawnFinish.detectedBaseUrl) {
            const perf = performance.getEntriesByType('resource') || [];
            for (const e of perf) {
              const m = e.name.match(/^(https?:\/\/[^\/]*(?:scoring|facts?)[^\/]*\/)/i);
              if (m) { SpawnFinish.detectedBaseUrl = m[1]; break; }
            }
          }
          if (!SpawnFinish.detectedBaseUrl) {
            const ck = document.cookie.match(/scoring_url=([^;]+)/);
            if (ck) SpawnFinish.detectedBaseUrl = decodeURIComponent(ck[1]);
          }
        } catch {}
        this._refreshSpawnUI();
        Logger.ok(`🔍 Detect: URL=${SpawnFinish.baseUrl || '✗'} Token=${SpawnFinish.token ? '✓' : '✗'}`);
        break;
      }
      case 'spawn-save': {
        const url = this.$('[data-spawn="url"]').value.trim();
        const token = this.$('[data-spawn="token"]').value.trim();
        if (url) SpawnFinish.baseUrl = url;
        if (token) SpawnFinish.token = token;
        this._refreshSpawnUI(); Logger.ok('💾 Config salva.');
        break;
      }
      case 'spawn-test': {
        const r = await SpawnFinish.testEndpoint();
        r.ok ? Logger.ok('✅ Endpoint respondeu!') : Logger.err(`❌ Falhou: ${r.err || r.status}`);
        break;
      }
      case 'spawn-all-finish':
      case 'spawn-all-sequence': {
        const eps = EpisodeScanner.scan();
        if (!eps.length) { Logger.warn('Nenhum episódio escaneado'); break; }
        const stars = this._getStars('spawn');
        const score = +this.$('[data-score-input="spawn"]').value || null;
        const withSequence = name === 'spawn-all-sequence';
        await SpawnFinish.spawnAll(eps, { stars, score, withSequence, broadcast: Store.data.settings.spawnBroadcast !== false });
        this._refreshSpawnUI();
        break;
      }
      case 'spawn-custom-finish':
      case 'spawn-custom-sequence': {
        const val = this.$('[data-spawn-custom]').value;
        const stars = this._getStars('spawn');
        const score = +this.$('[data-score-input="spawn"]').value || null;
        await SpawnFinish.spawnCustom(val, { stars, score, withSequence: name === 'spawn-custom-sequence' });
        break;
      }
      case 'spawn-scan-perf': URLCapture.scanPerformance(); this._refreshSpawnUI(); Logger.info(`Scan perf: ${SpawnFinish.detectedBaseUrl || 'nada'}`); break;
      case 'spawn-list-captured': {
        Logger.info(`Capturadas: ${URLCapture.captured.length} URLs`);
        URLCapture.captured.slice(-20).forEach(c => Logger.info(`  [${c.via}] ${c.url.slice(0, 100)}`));
        break;
      }

      /* Auto */
      case 'queueFromScan': {
        const eps = EpisodeScanner.scan();
        if (!eps.length) { Logger.warn('Nada encontrado'); break; }
        AutoCompleter.enqueue(eps, { stars: this._getStars('auto'), score: +this.$('[data-score-input="auto"]').value || null, delay: +this.$('[data-auto-delay]').value });
        break;
      }
      case 'runAutoComplete':
        AutoCompleter.runAll({ stars: this._getStars('auto'), score: +this.$('[data-score-input="auto"]').value || null, delay: +this.$('[data-auto-delay]').value });
        break;
      case 'stopAutoComplete': AutoCompleter.stop(); break;
      case 'openAllAndComplete': {
        const eps = EpisodeScanner.scan();
        if (!eps.length) { Logger.warn('Nada encontrado'); break; }
        AutoCompleter.reset(); AutoCompleter.enqueue(eps, { stars: this._getStars('auto'), score: +this.$('[data-score-input="auto"]').value || null, delay: 1500 });
        await AutoCompleter.runAll({});
        break;
      }
      case 'unlockAllLevels': LevelUnlocker.unlockAll({ totalLevels: 20, stars: this._getStars('auto') }); break;
      case 'unlockInFirebase': LevelUnlocker.unlockInFirebase(); break;

      /* Spy/Debug/Logs */
      case 'copyEvents': Utils.copyText(Spy.export()); Logger.ok('📋 Eventos copiados.'); break;
      case 'exportEvents': Utils.download(`events-${Date.now()}.json`, Spy.export()); break;
      case 'clearEvents': Spy.clear(); break;
      case 'injectSpyHook': this._injectSpyHook(); break;
      case 'scanBridges': {
        const s = IframeBridge.scan();
        Logger.info(`Unity:${s.unityInstance} Canais:${s.channels.length} Iframes:${s.iframes.length}`);
        s.channels.forEach(c => Logger.info(`  • ${c}`));
        break;
      }
      case 'dumpState': {
        const st = {
          url: location.href, unity: !!window.unityInstance,
          iframes: IframeBridge._allIframes().length,
          episodes: EpisodeScanner.getAll().length,
          scoringURL: SpawnFinish.baseUrl, detectedURL: SpawnFinish.detectedBaseUrl,
          hasToken: !!SpawnFinish.token,
          capturedURLs: URLCapture.captured.length,
          redacaoEngine: QuillBridge.kind()
        };
        Logger.info('State: ' + Utils.safeJson(st));
        break;
      }
      case 'injectFromInput': { const c = this.$('[data-inject]').value; if (c?.trim()) IframeBridge.injectIntoIframe(c); break; }
      case 'exportLogs': Utils.download(`logs-${Date.now()}.txt`, Logger.history.map(e => `[${e.t}][${e.type}] ${e.msg}`).join('\n'), 'text/plain'); break;
      case 'clearLogs': Logger.history = []; this.$('#rs-log')?.replaceChildren(); break;
    }
  },

  _injectSpyHook() {
    const spyCode = `
      (function() {
        if (window.__rsSpyInjected) return;
        window.__rsSpyInjected = true;
        const origPM = window.postMessage.bind(window);
        window.postMessage = function(d, ...r) {
          try {
            const p = typeof d === 'string' ? JSON.parse(d) : d;
            if (p && (p.type || p.Type)) parent.postMessage({ __rsSpy: true, dir: 'OUT', type: p.type || p.Type, data: p }, '*');
          } catch (e) {}
          return origPM(d, ...r);
        };
        window.addEventListener('message', (e) => {
          try {
            const p = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (p && (p.type || p.Type) && !p.__rsSpy) parent.postMessage({ __rsSpy: true, dir: 'IN', type: p.type || p.Type, data: p }, '*');
          } catch (e) {}
        }, true);
      })();`;
    IframeBridge.injectIntoIframe(spyCode, null);
  }
};

/* ── EXTENSÕES UI/RUNTIME: expõe novos módulos sem tocar no UI legado ── */

const RsExtensions = {
  install() {
    try { ShortcutManager.install(); } catch {}
    try {
      ShortcutManager.register('ctrl+enter', () => {
        try { EventBus.emit('shortcut:analyze', { text: EditorObject.getText() }); } catch {}
        try { Logger.info('Ctrl+Enter: análise solicitada.'); } catch {}
      }, { label: 'Analisar texto' });
    } catch {}
    try {
      ShortcutManager.register('escape', () => {}, { label: 'Fechar/minimizar', allowInInput: true });
    } catch {}
    return { ok: true, modules: ModuleRegistry.list().length };
  },
  api() {
    return {
      version: '6.1.0-rs50',
      modules: () => ModuleRegistry.list(),
      analyze: (t) => TextEngine.analyze(t ?? EditorCore.get()),
      result: (t) => ResultSchema.build(t ?? EditorCore.get()),
      cards: (t) => ResultCards.build(t ?? EditorCore.get()),
      readability: (t) => ReadabilityAnalyzer.analyze(t ?? EditorCore.get()),
      synonyms: (w) => SynonymsBank.suggest(w),
      repertoire: (q) => RepertoireBank.search(q),
      themes: (axis) => (axis ? EssayThemes.byAxis(axis) : EssayThemes.items),
      randomTheme: () => EssayThemes.random(),
      skeleton: (m, th) => SkeletonGenerator.generate(m, th),
      intervention: (f) => InterventionBuilder.build(f || {}),
      score: (t) => CompetenceScorer.score(t ?? EditorCore.get(), CompetenceChecklist.get()),
      pdf: (t, o) => PdfExporter.export(t ?? EditorCore.get(), o),
      markdown: (t) => MarkdownExporter.report(ResultSchema.build(t ?? EditorCore.get())),
      goals: () => GoalsManager.status(),
      week: () => ProgressTracker.week(),
      security: () => CspHelper.describe(),
      vessie: VessieStudio.api()
    };
  }
};

ModuleRegistry.register('RsExtensions', RsExtensions, { kind: 'runtime' });

/* Expõe no runtime global sem sobrescrever APIs legadas: mescla com assign. */
try {
  const ext = RsExtensions.api();
  if (typeof window !== 'undefined') {
    window.RedacaoStudio = Object.assign({}, window.RedacaoStudio || {}, {
      rs50: ext,
      analyze50: ext.analyze, cards50: ext.cards, repertoire: ext.repertoire,
      themes: ext.themes, skeleton: ext.skeleton, pdfSafe: ext.pdf
    });
    if (window.MatificPanel) {
      window.MatificPanel.rs = ext;
      window.MatificPanel.modules = () => ModuleRegistry.list();
    }
  }
} catch {}
try { RsExtensions.install(); } catch {}

const VessieStudio = {
  _timerIv: null,
  _analysisTimer: null,
  _report: null,
  _unsubscribe: null,
  _commands: [
    { label: 'Analisar texto e sugerir objetivos', run: () => this.analyze() },
    { label: 'Gerar plano de redação', run: () => this.generatePlan() },
    { label: 'Abrir banco de repertório', run: () => this.show('library') },
    { label: 'Iniciar ou parar cronômetro', run: () => this.toggleTimer() },
    { label: 'Exportar relatório Markdown', run: () => this.exportMarkdown() },
    { label: 'Abrir configurações Vessie', run: () => this.show('settings') },
    { label: 'Analisar com LM Studio local', run: () => this.askLocalModel() }
  ],

  el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  },

  button(label, action, className = 'rs-btn') {
    const node = this.el('button', className, label);
    node.type = 'button';
    node.dataset.vessieAct = action;
    return node;
  },

  field(label, name, value, type = 'text') {
    const wrap = this.el('label', 'vessie-field');
    wrap.appendChild(this.el('span', '', label));
    const input = this.el(type === 'textarea' ? 'textarea' : 'input', 'rs-input');
    input.dataset.vessieField = name;
    if (type === 'textarea') input.value = value;
    else {
      input.type = type;
      input.value = value;
    }
    wrap.appendChild(input);
    return wrap;
  },

  mount() {
    if (!UI.root || UI.$('[data-vessie-root]')) return;
    Vessie.load();
    const style = this.el('style');
    style.textContent = `
      .vessie-root{gap:10px}
      .vessie-hero{background:linear-gradient(135deg,#3b2d83,#146d74);border:1px solid #7362ce;border-radius:14px;padding:14px;color:#fff}
      .vessie-hero h2{font-size:18px;margin-bottom:5px}.vessie-hero p{color:#e3e2ff;line-height:1.5}
      .vessie-nav,.vessie-actions,.vessie-chiprow{display:flex;flex-wrap:wrap;gap:6px}
      .vessie-nav button.rs-on{border-color:var(--ac2);color:var(--ac2)}
      .vessie-view{display:none;flex-direction:column;gap:9px}.vessie-view.rs-on{display:flex}
      .vessie-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .vessie-card{background:var(--panel2);border:1px solid var(--bd);border-radius:10px;padding:10px}
      .vessie-card h3{font-size:12px;margin-bottom:6px;color:var(--ac2)}
      .vessie-metric{display:grid;grid-template-columns:minmax(85px,1fr) 2fr auto;gap:7px;align-items:center;padding:6px 0;border-bottom:1px solid var(--bd);font-size:11px}
      .vessie-meter{height:7px;background:var(--bg);border-radius:8px;overflow:hidden}.vessie-meter i{display:block;height:100%;background:var(--ac2)}
      .vessie-note{font-size:11px;color:var(--tx2);line-height:1.55}
      .vessie-field{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:11px;color:var(--tx2)}
      .vessie-field input,.vessie-field textarea{width:100%;min-width:0}.vessie-field textarea{min-height:90px;resize:vertical}
      .vessie-result{white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:9px;font:11px/1.5 ui-monospace,Consolas,monospace}
      .vessie-command-overlay{position:fixed;inset:0;background:#0009;z-index:2147483647;display:flex;align-items:flex-start;justify-content:center;padding:12vh 15px}
      .vessie-command-box{width:min(520px,95vw);max-height:70vh;overflow:auto;background:var(--panel);border:1px solid var(--bd);border-radius:12px;padding:12px;box-shadow:0 20px 70px #0008}
      .vessie-command-box button{width:100%;text-align:left;margin-top:6px}
      .rs-app[data-vessie-theme="paper"]{--bg:#f4f1e8;--panel:#fffdf6;--panel2:#f2eee2;--panel3:#e7e0d1;--tx:#28251f;--tx2:#756f63;--bd:#d5cebd;--bd2:#c2b9a5;--ac:#6552a3;--ac2:#594593}
      .rs-app[data-vessie-theme="forest"]{--bg:#101b19;--panel:#162622;--panel2:#20352e;--panel3:#2b443a;--tx:#e5f4e9;--tx2:#a1b7aa;--bd:#365246;--bd2:#476a59;--ac:#32845b;--ac2:#64c18d}
      .rs-app[data-vessie-theme="ocean"]{--bg:#101b2a;--panel:#142438;--panel2:#1b314a;--panel3:#24415d;--tx:#e8f4ff;--tx2:#a7bfd5;--bd:#304d68;--bd2:#416787;--ac:#2679bd;--ac2:#62b8f1}
      @media(max-width:560px){.vessie-grid{grid-template-columns:1fr}.vessie-metric{grid-template-columns:1fr auto}.vessie-meter{grid-column:1/-1}}
    `;
    UI.root.appendChild(style);

    const tab = this.el('button', '', '✨');
    tab.type = 'button';
    tab.dataset.tab = 'vessie';
    tab.title = 'Vessie — análise, escrita e produtividade';
    tab.onclick = () => this.show();
    UI.$('.rs-tabs').appendChild(tab);

    const pane = this.el('div', 'rs-pane vessie-root');
    pane.dataset.pane = 'vessie';
    pane.dataset.vessieRoot = 'true';
    const hero = this.el('section', 'vessie-hero');
    hero.appendChild(this.el('h2', '', 'Vessie Studio'));
    hero.appendChild(this.el('p', '', 'Análise local, planejamento de escrita, repertório e produtividade. Indicadores orientativos — não substituem revisão humana.'));
    const commandButton = this.button('⌘ Comandos · Ctrl+Shift+P', 'palette');
    hero.appendChild(commandButton);
    pane.appendChild(hero);

    const nav = this.el('nav', 'vessie-nav');
    for (const [id, title] of [['analysis', 'Análise'], ['writing', 'Escrita'], ['library', 'Repertório'], ['productivity', 'Produtividade'], ['ai', 'LM Studio'], ['settings', 'Configurar']]) {
      const button = this.el('button', 'rs-btn', title);
      button.type = 'button';
      button.dataset.vessieView = id;
      if (id === 'analysis') button.classList.add('rs-on');
      nav.appendChild(button);
    }
    pane.appendChild(nav);
    pane.append(
      this.analysisView(),
      this.writingView(),
      this.libraryView(),
      this.productivityView(),
      this.aiView(),
      this.settingsView()
    );
    UI.$('.rs-body').appendChild(pane);
    UI.root.addEventListener('click', event => this.onClick(event));
    UI.root.addEventListener('input', event => this.onInput(event));
    UI.root.addEventListener('change', event => this.onChange(event));
    this._keyHandler = event => this.onKey(event);
    document.addEventListener('keydown', this._keyHandler, true);
    const editor = UI.$('.rs-editor');
    editor?.addEventListener('input', () => {
      clearTimeout(this._analysisTimer);
      this._analysisTimer = setTimeout(() => this.analyze(), 450);
    });
    this.applyTheme();
    this.refreshProductivity();
    this.analyze();
  },

  analysisView() {
    const view = this.el('section', 'vessie-view rs-on');
    view.dataset.vessieView = 'analysis';
    const actions = this.el('div', 'vessie-actions');
    actions.append(this.button('↻ Analisar agora', 'analyze', 'rs-btn rs-primary'), this.button('⬇ Relatório Markdown', 'markdown'));
    view.append(actions);
    const summary = this.el('div', 'vessie-grid');
    summary.dataset.vessieSummary = 'true';
    view.append(summary);
    const competencies = this.el('div', 'vessie-card');
    competencies.appendChild(this.el('h3', '', 'Checklist por competência'));
    const checklist = this.el('div');
    checklist.dataset.vessieChecklist = 'true';
    competencies.appendChild(checklist);
    view.append(competencies);
    const objectives = this.el('div', 'vessie-card');
    objectives.appendChild(this.el('h3', '', 'Objetivos sugeridos pela análise'));
    const items = this.el('div');
    items.dataset.vessieObjectives = 'true';
    objectives.appendChild(items);
    view.append(objectives);
    const metrics = this.el('div', 'vessie-card');
    metrics.appendChild(this.el('h3', '', 'Indicadores heurísticos'));
    const list = this.el('div');
    list.dataset.vessieMetrics = 'true';
    metrics.appendChild(list);
    view.append(metrics);
    return view;
  },

  writingView() {
    const view = this.el('section', 'vessie-view');
    view.dataset.vessieView = 'writing';
    view.append(this.el('h3', 'vessie-card', 'Gerador de planos e treino de propostas'));
    const topic = this.field('Tema (escreva ou sorteie)', 'topic', '');
    view.append(topic);
    const themes = this.el('div', 'vessie-chiprow');
    themes.dataset.vessieThemes = 'true';
    view.append(themes);
    const actions = this.el('div', 'vessie-actions');
    actions.append(this.button('🎲 Sortear proposta', 'random-theme'), this.button('✍ Gerar plano', 'generate-plan', 'rs-btn rs-primary'), this.button('🧩 Treino rápido', 'drill'));
    view.append(actions);
    const plan = this.el('pre', 'vessie-result');
    plan.dataset.vessiePlan = 'true';
    view.append(plan);
    const intervention = this.el('div', 'vessie-card');
    intervention.appendChild(this.el('h3', '', 'Construtor de intervenção'));
    const fields = this.el('div', 'vessie-grid');
    for (const [name, label] of [['agente', 'Agente'], ['acao', 'Ação'], ['meio', 'Meio'], ['finalidade', 'Finalidade'], ['detalhamento', 'Detalhamento']]) {
      fields.appendChild(this.field(label, `intervention-${name}`, ''));
    }
    intervention.append(fields, this.button('Montar proposta', 'intervention'));
    const result = this.el('pre', 'vessie-result');
    result.dataset.vessieIntervention = 'true';
    intervention.appendChild(result);
    view.append(intervention);
    return view;
  },

  libraryView() {
    const view = this.el('section', 'vessie-view');
    view.dataset.vessieView = 'library';
    const search = this.field('Buscar leis, pensadores, filmes, séries ou documentos', 'repertoire-search', '');
    view.append(search, this.button('Buscar repertório', 'search-library', 'rs-btn rs-primary'));
    const results = this.el('div', 'vessie-card');
    results.dataset.vessieLibraryResults = 'true';
    results.textContent = 'Pesquise para consultar o banco local. Confira as fontes antes de citar.';
    view.append(results);
    return view;
  },

  productivityView() {
    const view = this.el('section', 'vessie-view');
    view.dataset.vessieView = 'productivity';
    const goal = this.field('Meta diária de palavras', 'daily-goal', String(Vessie.state.config.dailyWordGoal), 'number');
    view.append(goal);
    const controls = this.el('div', 'vessie-actions');
    controls.append(this.button('Sugerir meta pela semana', 'suggest-goal'), this.button('Salvar meta', 'save-goal'), this.button('▶ Iniciar foco', 'timer', 'rs-btn rs-primary'), this.button('⬇ Exportar PDF', 'pdf'));
    view.append(controls);
    const timer = this.el('div', 'vessie-card', '25:00');
    timer.dataset.vessieTimer = 'true';
    view.append(timer);
    const stats = this.el('div', 'vessie-card');
    stats.dataset.vessieStats = 'true';
    view.append(stats);
    const sessions = this.el('div', 'vessie-card');
    sessions.appendChild(this.el('h3', '', 'Últimos sete dias'));
    const week = this.el('div');
    week.dataset.vessieWeek = 'true';
    sessions.appendChild(week);
    view.append(sessions);
    return view;
  },

  aiView() {
    const view = this.el('section', 'vessie-view');
    view.dataset.vessieView = 'ai';
    view.appendChild(this.el('p', 'vessie-note', 'O relatório determinístico é criado localmente, sem IA. Ao clicar em “Enviar relatório e redação”, somente então o relatório e o rascunho atual serão enviados ao endpoint LM Studio configurado em localhost.'));
    view.append(this.field('Endpoint local OpenAI-compatible', 'lm-endpoint', Vessie.state.config.lmEndpoint));
    view.append(this.field('Modelo (em branco: detectar o primeiro disponível)', 'lm-model', Vessie.state.config.lmModel));
    const actions = this.el('div', 'vessie-actions');
    actions.append(this.button('Verificar modelos locais', 'models'), this.button('Enviar relatório e redação', 'ask-model', 'rs-btn rs-primary'));
    view.append(actions);
    const status = this.el('div', 'vessie-card', 'Relatório ainda não enviado.');
    status.dataset.vessieAiStatus = 'true';
    const response = this.el('pre', 'vessie-result');
    response.dataset.vessieAiResponse = 'true';
    view.append(status, response);
    return view;
  },

  settingsView() {
    const view = this.el('section', 'vessie-view');
    view.dataset.vessieView = 'settings';
    view.appendChild(this.el('p', 'vessie-note', 'Vessie é uma linguagem declarativa limitada a preferências permitidas. O programa não executa JavaScript e não pode alterar o site.'));
    view.append(this.field('Tema', 'theme', Vessie.state.config.theme));
    view.append(this.field('Programa Vessie', 'program', [
      '# Objetivos e preferências do Studio',
      `dailyWordGoal = ${Vessie.state.config.dailyWordGoal}`,
      `focusMinutes = ${Vessie.state.config.focusMinutes}`,
      `lmEndpoint = "${Vessie.state.config.lmEndpoint}"`,
      `lmModel = "${Vessie.state.config.lmModel}"`,
      `theme = "${Vessie.state.config.theme}"`
    ].join('\n'), 'textarea'));
    view.append(this.button('Aplicar programa seguro', 'apply-program', 'rs-btn rs-primary'));
    const status = this.el('div', 'vessie-card', 'Configuração local; nenhum código arbitrário é executado.');
    status.dataset.vessieConfigStatus = 'true';
    view.append(status);
    return view;
  },

  onClick(event) {
    const nav = event.target.closest('.vessie-nav [data-vessie-view]');
    if (nav) {
      this.show(nav.dataset.vessieView);
      return;
    }
    const check = event.target.closest('[data-vessie-check]');
    if (check) {
      CompetenceChecklist.toggle(check.dataset.vessieCheck);
      this.renderChecklist();
      return;
    }
    const objective = event.target.closest('[data-vessie-objective]');
    if (objective) {
      const goals = Vessie.state.config.objectives || [];
      const item = this._report?.suggestedObjectives.find(goal => goal.id === objective.dataset.vessieObjective);
      if (item && !goals.some(goal => goal.id === item.id)) {
        Vessie.state.config.objectives = [...goals, item];
        Vessie.save();
        objective.textContent = '✓ Adicionado';
        objective.disabled = true;
      }
      return;
    }
    const action = event.target.closest('[data-vessie-act]');
    if (!action) return;
    const name = action.dataset.vessieAct;
    const tasks = {
      analyze: () => this.analyze(),
      markdown: () => this.exportMarkdown(),
      'random-theme': () => this.randomTheme(),
      'generate-plan': () => this.generatePlan(),
      drill: () => this.pickDrill(),
      intervention: () => this.buildIntervention(),
      'search-library': () => this.searchLibrary(),
      'suggest-goal': () => this.suggestGoal(),
      'save-goal': () => this.saveGoal(),
      timer: () => this.toggleTimer(),
      pdf: () => this.exportPdf(),
      models: () => this.listModels(),
      'ask-model': () => this.askLocalModel(),
      'apply-program': () => this.applyProgram(),
      palette: () => this.openPalette()
    };
    if (tasks[name]) Promise.resolve(tasks[name]()).catch(error => this.showError(error));
  },

  onInput(event) {
    if (event.target.matches('[data-vessie-field="repertoire-search"]')) this.searchLibrary();
    if (event.target.matches('[data-vessie-field="daily-goal"]')) this.refreshProductivity();
  },

  onChange(event) {
    const field = event.target.dataset.vessieField;
    if (field === 'lm-endpoint') Vessie.state.config.lmEndpoint = event.target.value.trim();
    if (field === 'lm-model') Vessie.state.config.lmModel = event.target.value.trim();
  },

  onKey(event) {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.openPalette();
      return;
    }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.show('analysis');
      this.analyze();
      return;
    }
    if (event.key === 'Escape') {
      UI.$('.vessie-command-overlay')?.remove();
      return;
    }
  },

  show(view = 'analysis') {
    UI.setMin(false);
    UI.setTab('vessie');
    const allowed = new Set(['analysis', 'writing', 'library', 'productivity', 'ai', 'settings']);
    const selected = allowed.has(view) ? view : 'analysis';
    UI.$$('[data-vessie-view]').forEach(node => node.classList.toggle('rs-on', node.dataset.vessieView === selected));
    UI.$$('.vessie-nav [data-vessie-view]').forEach(node => node.classList.toggle('rs-on', node.dataset.vessieView === selected));
    if (selected === 'analysis') this.analyze();
    if (selected === 'productivity') this.refreshProductivity();
  },

  analyze() {
    const text = UI.$('.rs-editor')?.value || '';
    const analysis = Vessie.analyze(text);
    this._report = VessieReport.create(text, analysis);
    this.renderAnalysis(analysis);
    const history = Store.data.vessieReports || [];
    Store.data.vessieReports = [{ at: this._report.generatedAt, counts: this._report.counts, summary: this._report.summary }, ...history].slice(0, 30);
    Store.save();
    ProgressTracker.log(analysis.counts.words);
    this.refreshProductivity();
    EventBus.emit('vessie:report', this._report);
    return this._report;
  },

  renderAnalysis(analysis) {
    const summary = UI.$('[data-vessie-summary]');
    if (summary) {
      summary.replaceChildren();
      const cards = [
        ['Palavras', analysis.counts.words],
        ['Frases', analysis.counts.sentences],
        ['Parágrafos', analysis.counts.paragraphs],
        ['Diversidade lexical', `${analysis.counts.lexicalDiversity}%`],
        ...Object.entries(analysis.summary).map(([name, score]) => [name, `${score}/100`])
      ];
      for (const [label, value] of cards) {
        const card = this.el('div', 'vessie-card');
        card.append(this.el('h3', '', String(value)), this.el('span', 'vessie-note', label));
        summary.appendChild(card);
      }
    }
    this.renderChecklist();
    this.renderObjectives();
    const list = UI.$('[data-vessie-metrics]');
    if (list) {
      list.replaceChildren();
      const groups = new Map();
      for (const metric of analysis.metrics) {
        if (!groups.has(metric.group)) groups.set(metric.group, []);
        groups.get(metric.group).push(metric);
      }
      for (const [group, metrics] of groups) {
        const details = this.el('details');
        const heading = this.el('summary', '', `${group} · ${metrics.length} indicadores`);
        details.appendChild(heading);
        for (const metric of metrics) {
          const row = this.el('div', 'vessie-metric');
          row.append(this.el('span', '', metric.label));
          const meter = this.el('span', 'vessie-meter');
          const fill = this.el('i');
          fill.style.width = `${metric.score}%`;
          meter.appendChild(fill);
          row.append(meter, this.el('b', '', `${metric.score}`));
          if (metric.finding) row.title = `${metric.finding}${metric.advice ? ` ${metric.advice}` : ''}`;
          details.appendChild(row);
          if (metric.advice) details.appendChild(this.el('p', 'vessie-note', metric.advice));
        }
        list.appendChild(details);
      }
    }
  },

  renderChecklist() {
    const target = UI.$('[data-vessie-checklist]');
    if (!target) return;
    target.replaceChildren();
    for (const item of CompetenceChecklist.get()) {
      const row = this.el('label', 'vessie-note');
      const checkbox = this.el('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.done;
      checkbox.dataset.vessieCheck = item.id;
      checkbox.style.marginRight = '7px';
      row.append(checkbox, this.el('b', '', item.title), this.el('span', '', ` — ${item.hint}`));
      target.appendChild(row);
    }
  },

  renderObjectives() {
    const target = UI.$('[data-vessie-objectives]');
    if (!target) return;
    target.replaceChildren();
    if (!this._report?.suggestedObjectives.length) {
      target.appendChild(this.el('p', 'vessie-note', 'Escreva algumas frases para receber sugestões de objetivos.'));
      return;
    }
    const saved = Vessie.state.config.objectives || [];
    for (const objective of this._report.suggestedObjectives) {
      const row = this.el('div', 'vessie-metric');
      row.appendChild(this.el('span', '', objective.title));
      const added = saved.some(item => item.id === objective.id);
      const button = this.button(added ? '✓ Adicionado' : '+ Adicionar', '');
      button.dataset.vessieObjective = objective.id;
      button.disabled = added;
      row.appendChild(button);
      target.appendChild(row);
    }
  },

  randomTheme() {
    const theme = EssayThemes.random();
    const field = UI.$('[data-vessie-field="topic"]');
    if (field) field.value = theme.title;
    UI.$('[data-vessie-plan]')?.replaceChildren(this.el('span', '', `Proposta de treino: ${theme.title} · eixo ${theme.axis}`));
    return theme;
  },

  generatePlan() {
    const theme = UI.$('[data-vessie-field="topic"]')?.value.trim() || 'tema da redação';
    const plan = SkeletonGenerator.generate('enem', theme);
    const target = UI.$('[data-vessie-plan]');
    if (target) target.textContent = plan;
    if (UI.$('.rs-editor')) {
      const editor = UI.$('.rs-editor');
      editor.value = plan;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return plan;
  },

  pickDrill() {
    const drill = TrainingDrills.pick();
    const target = UI.$('[data-vessie-plan]');
    if (target) target.textContent = `${drill.title}\n\n${drill.task}`;
    return drill;
  },

  buildIntervention() {
    const fields = {};
    for (const name of ['agente', 'acao', 'meio', 'finalidade', 'detalhamento']) {
      fields[name] = UI.$(`[data-vessie-field="intervention-${name}"]`)?.value.trim() || '';
    }
    const built = InterventionBuilder.build(fields);
    const target = UI.$('[data-vessie-intervention]');
    if (target) target.textContent = `${built.text}\n\n${built.complete ? 'Elementos preenchidos.' : `Faltam: ${built.missing.join(', ')}`}`;
    return built;
  },

  searchLibrary() {
    const query = UI.$('[data-vessie-field="repertoire-search"]')?.value || '';
    const banks = RepertoireBank.search(query);
    const target = UI.$('[data-vessie-library-results]');
    if (!target) return banks;
    target.replaceChildren();
    let total = 0;
    for (const [kind, items] of Object.entries(banks)) {
      for (const item of items) {
        total++;
        const title = item.title || item.name || item.id;
        const entry = this.el('article', 'vessie-metric');
        entry.append(this.el('b', '', title), this.el('span', 'vessie-note', item.use || item.idea || item.theme || item.work || ''));
        target.appendChild(entry);
      }
    }
    if (!total) target.appendChild(this.el('p', 'vessie-note', 'Nenhum item encontrado. Tente outro termo.'));
    return banks;
  },

  refreshProductivity() {
    const status = GoalsManager.status();
    const todayWords = status.today.words || 0;
    const goalInput = UI.$('[data-vessie-field="daily-goal"]');
    const goal = Number(goalInput?.value || Vessie.state.config.dailyWordGoal) || 500;
    const stats = UI.$('[data-vessie-stats]');
    if (stats) {
      stats.replaceChildren();
      const summary = StatsManager.summarize(UI.$('.rs-editor')?.value || '');
      const lines = [
        `Progresso da meta: ${todayWords}/${goal} palavras (${Math.min(100, Math.round(todayWords / goal * 100))}%)`,
        `Texto atual: ${summary.words} palavras · ${summary.sentences} frases · ${summary.paragraphs} parágrafos`,
        `Sessões registradas hoje: ${status.today.sessions || 0} · minutos: ${status.today.mins || 0}`,
        `Sequência de dias produtivos: ${ProgressTracker.streak()}`
      ];
      for (const line of lines) stats.appendChild(this.el('p', 'vessie-note', line));
    }
    const week = UI.$('[data-vessie-week]');
    if (week) {
      week.replaceChildren();
      for (const day of ProgressTracker.week()) week.appendChild(this.el('p', 'vessie-note', `${day.key}: ${day.words || 0} palavras · ${day.sessions || 0} sessões · ${day.mins || 0} min`));
    }
    const timer = UI.$('[data-vessie-timer]');
    if (timer && !FocusTimer.running) timer.textContent = `${String(Vessie.state.config.focusMinutes).padStart(2, '0')}:00 · pronto`;
  },

  saveGoal() {
    const value = Number(UI.$('[data-vessie-field="daily-goal"]')?.value);
    if (!Number.isInteger(value) || value < 50 || value > 10000) throw new Error('A meta deve ser um número inteiro entre 50 e 10.000.');
    GoalsManager.set({ dailyWords: value });
    Vessie.state.config.dailyWordGoal = value;
    Vessie.save();
    this.refreshProductivity();
  },

  suggestGoal() {
    const suggestion = GoalWizard.suggest();
    const field = UI.$('[data-vessie-field="daily-goal"]');
    if (field) field.value = String(suggestion.suggestedDailyWords);
    const stats = UI.$('[data-vessie-stats]');
    if (stats) stats.prepend(this.el('p', 'vessie-note', `Sugestão baseada na semana: ${suggestion.suggestedDailyWords} palavras/dia. ${suggestion.hint}`));
    return suggestion;
  },

  toggleTimer() {
    if (FocusTimer.running) {
      const result = FocusTimer.stop(true);
      clearInterval(this._timerIv);
      this._timerIv = null;
      const button = UI.$('[data-vessie-act="timer"]');
      if (button) button.textContent = '▶ Iniciar foco';
      Logger.info(`Sessão de escrita registrada: ${result.mins} min.`);
    } else {
      const result = FocusTimer.begin(Vessie.state.config.focusMinutes);
      if (!result.ok) throw new Error('O cronômetro já está em execução.');
      const button = UI.$('[data-vessie-act="timer"]');
      if (button) button.textContent = '⏹ Parar foco';
      this._timerIv = setInterval(() => {
        const target = UI.$('[data-vessie-timer]');
        const remaining = Math.max(0, Vessie.state.config.focusMinutes * 60000 - FocusTimer.elapsed());
        if (target) target.textContent = `${FocusTimer.fmt(remaining)} restantes · em foco`;
        if (remaining === 0) {
          this.toggleTimer();
          Logger.ok('Sessão de foco concluída.');
        }
      }, 1000);
    }
    this.refreshProductivity();
  },

  exportMarkdown() {
    const text = UI.$('.rs-editor')?.value || '';
    const analysis = Vessie.analyze(text);
    const report = VessieReport.create(text, analysis);
    this._report = report;
    this.renderAnalysis(analysis);
    Utils.download('vessie-relatorio.md', VessieReport.markdown(report, text), 'text/markdown');
  },

  exportPdf() {
    const text = UI.$('.rs-editor')?.value || '';
    const result = ResultSchema.build(text);
    const exported = PdfExporter.export(text, { title: 'Relatório de redação — Vessie Studio', result });
    if (!exported.ok) throw new Error(`Falha ao abrir impressão/PDF: ${exported.err}`);
  },

  localEndpoint() {
    const raw = UI.$('[data-vessie-field="lm-endpoint"]')?.value.trim() || Vessie.state.config.lmEndpoint;
    const endpoint = new URL(raw);
    const localHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/u.test(endpoint.hostname);
    if (endpoint.protocol !== 'http:' || !localHost || endpoint.username || endpoint.password) {
      throw new Error('Por segurança, LM Studio deve estar em HTTP localhost, 127.x ou ::1, sem credenciais na URL.');
    }
    const normalized = endpoint.toString().replace(/\/$/u, '');
    Vessie.state.config.lmEndpoint = normalized;
    Vessie.state.config.lmModel = UI.$('[data-vessie-field="lm-model"]')?.value.trim() || '';
    Vessie.save();
    return normalized;
  },

  async listModels() {
    const status = UI.$('[data-vessie-ai-status]');
    if (status) status.textContent = 'Consultando /models em LM Studio local…';
    const endpoint = this.localEndpoint();
    LmConfig.set({ baseUrl: endpoint, model: Vessie.state.config.lmModel });
    const result = await LmClient.models(true);
    if (!result.ok) throw new Error(`Falha ao consultar modelos do LM Studio: ${result.err || 'erro desconhecido'}. ${result.hint || ''}`);
    const model = result.models[0];
    if (!model) throw new Error('LM Studio respondeu, mas não há modelo listado/carregado.');
    const field = UI.$('[data-vessie-field="lm-model"]');
    if (field && !field.value) field.value = model;
    if (status) status.textContent = `Conexão local ativa. Modelo disponível: ${model}`;
    return result.models.map(id => ({ id }));
  },

  async askLocalModel() {
    this.localEndpoint();
    const text = UI.$('.rs-editor')?.value || '';
    if (!text.trim()) throw new Error('Escreva um rascunho antes de pedir sugestões ao modelo.');
    const analysis = Vessie.analyze(text);
    const report = VessieReport.create(text, analysis);
    this._report = report;
    this.renderAnalysis(analysis);
    const status = UI.$('[data-vessie-ai-status]');
    const output = UI.$('[data-vessie-ai-response]');
    if (status) status.textContent = 'Consultando apenas o endpoint local do LM Studio…';
    if (output) output.textContent = '';
    let model = Vessie.state.config.lmModel;
    if (!model) {
      const available = await this.listModels();
      model = available[0]?.id;
      if (!model) throw new Error('Nenhum modelo local disponível.');
    }
    LmConfig.set({ baseUrl: this.localEndpoint(), model, timeoutMs: 90000 });
    const response = await LmClient.ask(
      `Relatório local determinístico sem IA:\n${JSON.stringify(report)}\n\nRascunho enviado por solicitação explícita:\n${text.slice(0, 24000)}`,
      'Você é um tutor de escrita em português. Dê feedback específico e respeitoso sobre coesão, repertório, ritmo e diversidade lexical, sem inventar fatos, fontes, dados ou leis. Não substitua a autoria: sugira próximos passos e exemplos curtos. Ao final, proponha (sem executar) até três melhorias para o sistema de análise com base nas métricas fornecidas.',
      { model, temperature: 0.3, maxTokens: 1200 }
    );
    if (!response.ok) throw new Error(`LM Studio falhou: ${response.err || 'erro desconhecido'}. ${response.hint || ''}`);
    const answer = response.text;
    if (!answer) throw new Error('LM Studio não retornou conteúdo de análise.');
    if (output) output.textContent = answer;
    if (status) status.textContent = `Sugestões recebidas do modelo local ${model}.`;
    return answer;
  },

  applyProgram() {
    const source = UI.$('[data-vessie-field="program"]')?.value || '';
    const config = Vessie.parseProgram(source);
    if (config.dailyWordGoal) GoalsManager.set({ dailyWords: config.dailyWordGoal });
    const goal = UI.$('[data-vessie-field="daily-goal"]');
    if (goal) goal.value = String(config.dailyWordGoal);
    const endpoint = UI.$('[data-vessie-field="lm-endpoint"]');
    if (endpoint) endpoint.value = config.lmEndpoint;
    const model = UI.$('[data-vessie-field="lm-model"]');
    if (model) model.value = config.lmModel;
    const theme = UI.$('[data-vessie-field="theme"]');
    if (theme) theme.value = config.theme;
    this.applyTheme();
    const status = UI.$('[data-vessie-config-status]');
    if (status) status.textContent = 'Programa aplicado e salvo localmente. Nenhum comando JavaScript foi executado.';
    this.refreshProductivity();
    return config;
  },

  applyTheme() {
    const app = UI.$('.rs-app');
    if (app) app.dataset.vessieTheme = Vessie.state.config.theme || 'midnight';
  },

  openPalette() {
    UI.$('.vessie-command-overlay')?.remove();
    const overlay = this.el('div', 'vessie-command-overlay');
    overlay.dataset.vessiePalette = 'true';
    const box = this.el('div', 'vessie-command-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Paleta de comandos');
    const search = this.el('input', 'rs-input');
    search.type = 'search';
    search.placeholder = 'Buscar ação…';
    search.setAttribute('aria-label', 'Buscar comando');
    box.appendChild(search);
    const list = this.el('div');
    box.appendChild(list);
    const render = () => {
      const query = search.value.trim().toLocaleLowerCase('pt-BR');
      list.replaceChildren();
      for (const command of this._commands.filter(item => item.label.toLocaleLowerCase('pt-BR').includes(query))) {
        const button = this.button(command.label, '');
        button.onclick = () => {
          overlay.remove();
          Promise.resolve(command.run()).catch(error => this.showError(error));
        };
        list.appendChild(button);
      }
    };
    search.addEventListener('input', render);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) overlay.remove(); });
    render();
    overlay.appendChild(box);
    UI.root.appendChild(overlay);
    search.focus();
  },

  showError(error) {
    const status = UI.$('[data-vessie-ai-status]') || UI.$('[data-vessie-config-status]');
    if (status) status.textContent = error.message;
    Logger.err(`Vessie: ${error.message}`);
  },

  api() {
    return {
      version: Vessie.version,
      moduleCount: () => Vessie.metricIds().length,
      analyze: text => this.analyzeText(text),
      report: text => VessieReport.create(text, Vessie.analyze(text)),
      config: () => ({ ...Vessie.state.config }),
      runConfig: program => Vessie.parseProgram(program),
      lmModels: () => this.listModels(),
      improveWithLocalModel: () => this.askLocalModel(),
      show: view => this.show(view),
      exportMarkdown: () => this.exportMarkdown(),
      exportPdf: () => this.exportPdf()
    };
  },

  analyzeText(text) {
    return Vessie.analyze(text ?? (UI.$('.rs-editor')?.value || ''));
  },

  destroy() {
    clearTimeout(this._analysisTimer);
    clearInterval(this._timerIv);
    if (FocusTimer.running) FocusTimer.stop(true);
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler, true);
    if (this._unsubscribe) this._unsubscribe();
  }
};

const VessieReport = {
  create(text, analysis = Vessie.analyze(text)) {
    const weakest = analysis.counts.words ? [...analysis.metrics]
      .filter(metric => metric.score < 65 && metric.advice)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map(metric => ({ id: metric.id, area: metric.group, finding: metric.finding, nextStep: metric.advice })) : [];
    const objectives = weakest.slice(0, 3).map(item => ({
      id: item.id,
      title: item.nextStep,
      completed: false
    }));
    return {
      schema: 'vessie-deterministic-report/1.0',
      generatedAt: new Date().toISOString(),
      source: 'heuristic-local-no-ai',
      counts: analysis.counts,
      summary: analysis.summary,
      strengths: [...analysis.metrics]
        .filter(metric => metric.score >= 80)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(metric => ({ area: metric.group, finding: metric.finding })),
      priorities: weakest,
      suggestedObjectives: objectives,
      note: 'Indicadores heurísticos para revisão; não são nota oficial nem avaliação humana.'
    };
  },

  markdown(report, text = '') {
    const lines = [
      '# Relatório Vessie — Redação',
      '',
      `- Gerado: ${new Date(report.generatedAt).toLocaleString('pt-BR')}`,
      `- Origem: ${report.source} (sem IA)`,
      `- Palavras: ${report.counts.words}; frases: ${report.counts.sentences}; parágrafos: ${report.counts.paragraphs}`,
      `- Diversidade lexical heurística: ${report.counts.lexicalDiversity}%`,
      '',
      '## Indicadores por área',
      ...Object.entries(report.summary).map(([area, score]) => `- ${area}: ${score}/100`),
      '',
      '## Pontos fortes',
      ...(report.strengths.length ? report.strengths.map(item => `- ${item.area}: ${item.finding}`) : ['- Revise as sugestões e continue desenvolvendo o texto.']),
      '',
      '## Próximos passos',
      ...(report.priorities.length ? report.priorities.map(item => `- ${item.nextStep}`) : ['- Continue a revisão de conteúdo, evidências e clareza.']),
      '',
      `> ${report.note}`
    ];
    if (text) lines.push('', '## Rascunho enviado para análise local', '', text);
    return lines.join('\n');
  }
};

const VessieLanguage = {
  tokenize(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const rest = source.slice(index);
      if (/^\s/u.test(rest)) {
        index++;
        continue;
      }
      if (rest[0] === '#') break;
      const string = rest.match(/^"(?:\\.|[^"\\])*"/u);
      if (string) {
        let value;
        try {
          value = JSON.parse(string[0]);
        } catch {
          throw new Error(`Texto inválido na coluna ${index + 1}.`);
        }
        tokens.push({ type: 'value', value });
        index += string[0].length;
        continue;
      }
      const number = rest.match(/^(?:\d+\.?\d*|\.\d+)/u);
      if (number) {
        tokens.push({ type: 'value', value: Number(number[0]) });
        index += number[0].length;
        continue;
      }
      const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/u);
      if (identifier) {
        tokens.push({ type: 'identifier', value: identifier[0] });
        index += identifier[0].length;
        continue;
      }
      if ('=+-*/()'.includes(rest[0])) {
        tokens.push({ type: rest[0], value: rest[0] });
        index++;
        continue;
      }
      throw new Error(`Símbolo não reconhecido na coluna ${index + 1}.`);
    }
    return tokens;
  },

  evaluate(tokens, variables, lineNumber) {
    let position = 0;
    const fail = message => { throw new Error(`Linha ${lineNumber}: ${message}`); };
    const peek = () => tokens[position];
    const take = type => {
      if (peek()?.type !== type) return null;
      return tokens[position++];
    };
    const expression = () => addition();
    const addition = () => {
      let left = multiplication();
      while (peek()?.type === '+' || peek()?.type === '-') {
        const operator = tokens[position++].type;
        const right = multiplication();
        if (operator === '+' && (typeof left === 'string' || typeof right === 'string')) {
          left = String(left) + String(right);
        } else {
          if (typeof left !== 'number' || typeof right !== 'number') fail('Use números nesta operação.');
          left = operator === '+' ? left + right : left - right;
        }
      }
      return left;
    };
    const multiplication = () => {
      let left = unary();
      while (peek()?.type === '*' || peek()?.type === '/') {
        const operator = tokens[position++].type;
        const right = unary();
        if (typeof left !== 'number' || typeof right !== 'number') fail('Use números nesta operação.');
        if (operator === '/' && right === 0) fail('Divisão por zero.');
        left = operator === '*' ? left * right : left / right;
      }
      return left;
    };
    const unary = () => {
      if (take('-')) {
        const value = unary();
        if (typeof value !== 'number') fail('O sinal negativo só pode ser usado com números.');
        return -value;
      }
      return primary();
    };
    const primary = () => {
      const value = take('value');
      if (value) return value.value;
      const identifier = take('identifier');
      if (identifier) {
        if (!Object.hasOwn(variables, identifier.value)) fail(`Variável "${identifier.value}" não definida.`);
        return variables[identifier.value];
      }
      if (take('(')) {
        const result = expression();
        if (!take(')')) fail('Faltou fechar os parênteses.');
        return result;
      }
      fail('Expressão incompleta.');
    };

    const result = expression();
    if (position !== tokens.length) fail('Há conteúdo inesperado após a expressão.');
    if (typeof result === 'number' && !Number.isFinite(result)) fail('O resultado não é finito.');
    return result;
  },

  run(source) {
    if (typeof source !== 'string' || source.length > 20000) {
      throw new Error('O programa deve ter até 20.000 caracteres.');
    }
    const lines = source.split(/\r?\n/u);
    if (lines.length > 300) throw new Error('O programa deve ter até 300 linhas.');
    const variables = Object.create(null);
    const output = [];
    let steps = 0;

    for (let index = 0; index < lines.length; index++) {
      const text = lines[index].trim();
      if (!text || text.startsWith('#')) continue;
      steps++;
      if (steps > 300) throw new Error('Limite de instruções atingido.');
      const tokens = this.tokenize(text);
      const command = tokens.shift();
      if (command?.type !== 'identifier') throw new Error(`Linha ${index + 1}: esperado "let" ou "print".`);
      if (command.value === 'let') {
        const name = tokens.shift();
        if (name?.type !== 'identifier' || name.value === 'let' || name.value === 'print') {
          throw new Error(`Linha ${index + 1}: nome de variável inválido.`);
        }
        if (tokens.shift()?.type !== '=') throw new Error(`Linha ${index + 1}: esperado "=".`);
        if (Object.keys(variables).length >= 100 && !Object.hasOwn(variables, name.value)) {
          throw new Error('Limite de 100 variáveis atingido.');
        }
        variables[name.value] = this.evaluate(tokens, variables, index + 1);
      } else if (command.value === 'print') {
        if (!tokens.length) throw new Error(`Linha ${index + 1}: informe um valor para imprimir.`);
        output.push(String(this.evaluate(tokens, variables, index + 1)));
        if (output.length > 100) throw new Error('Limite de 100 saídas atingido.');
      } else {
        throw new Error(`Linha ${index + 1}: comando "${command.value}" desconhecido.`);
      }
    }
    return { output, variables: { ...variables }, steps };
  }
};

const VessieDesktop = {
  pane: null,
  shell: null,
  windows: new Map(),
  fileSystem: null,
  nextZ: 20,
  wasFull: false,
  startOpen: false,
  clockInterval: null,
  abortController: null,

  mount() {
    if (!UI.root || UI.$('[data-vessie-desktop]')) return;
    const style = document.createElement('style');
    style.textContent = `
      .rs-app.rs-desktop-mode{position:fixed!important;inset:0!important;left:0!important;top:0!important;width:100vw!important;max-width:100vw!important;height:100vh!important;max-height:100vh!important;height:100dvh!important;max-height:100dvh!important;border:0!important;border-radius:0!important;box-shadow:none!important;z-index:2147483646!important}
      .rs-app.rs-desktop-mode>.rs-prog,.rs-app.rs-desktop-mode>.rs-head,.rs-app.rs-desktop-mode>.rs-tabs{display:none!important}
      .rs-app.rs-desktop-mode>.rs-body{display:flex!important;overflow:hidden!important;padding:0!important;min-height:0!important}
      .rs-desktop-pane{flex:1!important;min-height:0!important;width:100%;height:100%;gap:0!important}
      .vessie-desktop{--desk-blue:#0879c9;--desk-accent:#27a4f5;--desk-ink:#f7fbff;--desk-muted:#c6deef;position:relative;isolation:isolate;display:flex;flex:1;min-height:0;flex-direction:column;overflow:hidden;color:var(--desk-ink);font:14px/1.4 'Segoe UI',system-ui,sans-serif;background:radial-gradient(ellipse at 69% 43%,#22a4ed 0,#0878c9 26%,#064887 59%,#031c48 100%)}
      .vessie-desktop *{box-sizing:border-box}
      .vessie-desktop button{font:inherit;color:inherit}
      .vessie-desktop-wallpaper{position:absolute;inset:0;z-index:-1;overflow:hidden;background:linear-gradient(120deg,rgba(3,18,53,.22),transparent 63%)}
      .vessie-desktop-wallpaper:before,.vessie-desktop-wallpaper:after{content:"";position:absolute;right:-12%;top:7%;width:min(72vw,920px);height:min(84vh,780px);border:2px solid rgba(137,216,255,.46);transform:perspective(900px) rotateY(-29deg) rotateZ(-2deg);box-shadow:inset 0 0 120px rgba(45,179,255,.24),0 0 90px rgba(48,173,255,.25)}
      .vessie-desktop-wallpaper:after{right:8%;top:17%;width:min(42vw,520px);height:min(65vh,600px);border-color:rgba(180,235,255,.32);box-shadow:inset 0 0 90px rgba(45,179,255,.2)}
      .vessie-desktop-icons{position:absolute;left:12px;top:12px;bottom:60px;display:flex;flex-direction:column;align-items:flex-start;gap:7px;flex-wrap:wrap;align-content:flex-start}
      .vessie-desktop-icon{width:86px;min-height:76px;padding:6px 3px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid transparent;border-radius:3px;background:transparent;text-align:center;font-size:12px;cursor:pointer;text-shadow:0 1px 3px #00152b}
      .vessie-desktop-icon:hover,.vessie-desktop-icon:focus-visible{outline:none;background:rgba(185,225,255,.2);border-color:rgba(220,242,255,.28)}
      .vessie-desktop-icon i{font-style:normal;font-size:30px;line-height:1.1}
      .vessie-window{position:absolute;z-index:2;left:clamp(10px,calc(50% - 390px),35vw);top:clamp(10px,7vh,58px);display:flex;flex-direction:column;width:min(780px,calc(100% - 24px));height:min(610px,calc(100% - 68px));min-width:min(320px,calc(100% - 16px));min-height:230px;resize:both;overflow:hidden;background:#f3f6f9;color:#18232e;border:1px solid #d8e1ea;border-radius:5px;box-shadow:0 18px 52px #00142d80}
      .vessie-window[hidden]{display:none}
      .vessie-window.is-maximized{left:8px!important;top:8px!important;width:calc(100% - 16px)!important;height:calc(100% - 62px)!important;resize:none}
      .vessie-window-titlebar{height:40px;min-height:40px;display:flex;align-items:center;gap:10px;padding:0 7px 0 13px;background:#f8fafc;user-select:none;touch-action:none}
      .vessie-window-title{flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .vessie-window-action{width:37px;height:32px;border:0;border-radius:3px;background:transparent;color:#34495c!important;cursor:pointer}
      .vessie-window-action:hover{background:#e5edf5}.vessie-window-action[data-window-action="close"]:hover{background:#d83943;color:#fff!important}
      .vessie-window-content{display:flex;flex:1;min-height:0;flex-direction:column;padding:12px;gap:9px;overflow:auto}
      .vessie-window-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:7px}
      .vessie-window-toolbar button,.vessie-window-toolbar select{min-height:32px;padding:5px 10px;border:1px solid #c7d5e1;border-radius:3px;background:#fff;color:#203040;cursor:pointer}
      .vessie-window-toolbar button:hover{border-color:#329add;background:#f0f8ff}
      .vessie-code-editor,.vessie-terminal-input{width:100%;border:1px solid #b6c8d7;border-radius:3px;background:#111a26;color:#e8f0f7;font:13px/1.55 Consolas,'Courier New',monospace;outline:none}
      .vessie-code-editor{flex:1;min-height:150px;resize:none;padding:12px;tab-size:2}
      .vessie-code-editor:focus,.vessie-terminal-input:focus{border-color:#168bd2;box-shadow:0 0 0 2px #168bd233}
      .vessie-window-hint{color:#506579;font-size:12px}
      .vessie-code-output{min-height:74px;max-height:27%;overflow:auto;padding:8px 10px;border:1px solid #cad7e0;border-radius:3px;background:#fff;color:#17314a;font:12px/1.5 Consolas,'Courier New',monospace;white-space:pre-wrap;overflow-wrap:anywhere}
      .vessie-code-output[data-error="true"]{color:#a42028;border-color:#e99ca0}
      .vessie-os-console{flex:1;min-height:120px;overflow:auto;padding:10px;border-radius:3px;background:#101a23;color:#b8edbd;font:12px/1.55 Consolas,'Courier New',monospace;white-space:pre-wrap;overflow-wrap:anywhere}
      .vessie-terminal-input{padding:9px 10px}
      .vessie-desktop-taskbar{position:relative;z-index:10;display:flex;align-items:center;gap:4px;min-height:48px;padding:4px 8px calc(4px + env(safe-area-inset-bottom,0px));background:rgba(12,22,34,.88);backdrop-filter:blur(16px);border-top:1px solid rgba(255,255,255,.2)}
      .vessie-taskbar-button{height:38px;min-width:42px;padding:0 10px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:3px;background:transparent;cursor:pointer}
      .vessie-taskbar-button:hover,.vessie-taskbar-button.is-active{background:rgba(210,235,255,.2)}
      .vessie-taskbar-button.is-active:after{content:"";position:absolute;bottom:1px;width:22px;height:2px;background:#48b7ff}
      .vessie-start-button{font-size:21px}
      .vessie-taskbar-apps{display:flex;flex:1;gap:3px;min-width:0}
      .vessie-taskbar-app{position:relative;font-size:18px}
      .vessie-taskbar-clock{padding:0 9px;text-align:center;font-size:11px;line-height:1.35;white-space:nowrap}
      .vessie-start-menu{position:absolute;z-index:12;left:0;bottom:calc(48px + env(safe-area-inset-bottom,0px));width:min(360px,calc(100vw - 16px));padding:12px;background:rgba(17,34,51,.97);border:1px solid #ffffff30;box-shadow:0 12px 38px #00152b99;backdrop-filter:blur(18px)}
      .vessie-start-menu[hidden]{display:none}
      .vessie-start-menu h2{margin:0 0 9px;font-size:14px;font-weight:600}
      .vessie-start-apps{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      .vessie-start-app{min-height:68px;padding:9px;border:1px solid #ffffff20;background:#ffffff0c;text-align:left;cursor:pointer}
      .vessie-start-app:hover{background:#168bd266;border-color:#8bd0ff}
      .vessie-start-app i{display:block;margin-bottom:5px;font-style:normal;font-size:23px}
      .vessie-desktop-exit{font-size:12px}
      @media(max-width:640px){
        .vessie-desktop-icons{left:6px;top:6px;gap:3px}
        .vessie-desktop-icon{width:72px;min-height:66px;font-size:11px}
        .vessie-desktop-icon i{font-size:26px}
        .vessie-window{left:6px!important;top:6px!important;width:calc(100% - 12px)!important;height:calc(100% - 62px)!important;min-width:0;min-height:0;resize:none}
        .vessie-window-content{padding:9px}
        .vessie-taskbar-button{min-width:38px;padding:0 7px}
        .vessie-desktop-exit{font-size:0}.vessie-desktop-exit:after{content:"Sair";font-size:11px}
      }
      @media(max-height:480px){.vessie-window{top:4px!important;height:calc(100% - 56px)!important}.vessie-desktop-icon{min-height:58px}.vessie-desktop-taskbar{min-height:42px}}
    `;
    UI.root.appendChild(style);
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.dataset.tab = 'desktop';
    tab.title = 'Desktop Vessie';
    tab.setAttribute('aria-label', 'Abrir desktop Vessie');
    tab.textContent = '🖥️';
    tab.addEventListener('click', () => this.open());
    UI.$('.rs-tabs').appendChild(tab);

    this.pane = document.createElement('div');
    this.pane.className = 'rs-pane rs-desktop-pane';
    this.pane.dataset.pane = 'desktop';
    this.pane.dataset.vessieDesktop = 'true';
    this.pane.innerHTML = `
      <main class="vessie-desktop" aria-label="Desktop Vessie">
        <div class="vessie-desktop-wallpaper" aria-hidden="true"></div>
        <div class="vessie-desktop-icons">
          <button class="vessie-desktop-icon" data-open-app="code"><i>🧑‍💻</i><span>VessieScript</span></button>
          <button class="vessie-desktop-icon" data-open-app="os"><i>💻</i><span>VessieOS</span></button>
          <button class="vessie-desktop-icon" data-open-app="writing"><i>📝</i><span>Escrita</span></button>
          <button class="vessie-desktop-icon" data-open-app="games"><i>🎮</i><span>Jogos</span></button>
        </div>
        <div class="vessie-start-menu" data-start-menu hidden>
          <h2>Iniciar · Vessie Studio</h2>
          <div class="vessie-start-apps">
            <button class="vessie-start-app" data-open-app="code"><i>🧑‍💻</i>VessieScript</button>
            <button class="vessie-start-app" data-open-app="os"><i>💻</i>Terminal VessieOS</button>
            <button class="vessie-start-app" data-open-app="writing"><i>📝</i>Estúdio de escrita</button>
            <button class="vessie-start-app" data-open-app="games"><i>🎮</i>Modo de jogo</button>
          </div>
        </div>
        <div class="vessie-desktop-taskbar">
          <button class="vessie-taskbar-button vessie-start-button" type="button" data-desktop-action="start" aria-label="Menu Iniciar" aria-expanded="false">⊞</button>
          <div class="vessie-taskbar-apps">
            <button class="vessie-taskbar-button vessie-taskbar-app" type="button" data-open-app="code" aria-label="Abrir VessieScript">🧑‍💻</button>
            <button class="vessie-taskbar-button vessie-taskbar-app" type="button" data-open-app="os" aria-label="Abrir VessieOS">💻</button>
          </div>
          <button class="vessie-taskbar-button vessie-desktop-exit" type="button" data-desktop-action="exit">Voltar ao Studio</button>
          <time class="vessie-taskbar-clock" data-desktop-clock></time>
        </div>
      </main>`;
    UI.$('.rs-body').appendChild(this.pane);
    this.shell = this.pane.querySelector('.vessie-desktop');
    this.abortController = new AbortController();
    const options = { signal: this.abortController.signal };
    this.shell.addEventListener('click', event => this.onClick(event), options);
    this.shell.addEventListener('keydown', event => this.onKeydown(event), options);
    this.clockInterval = setInterval(() => this.updateClock(), 30000);
    this.updateClock();
    ModuleRegistry.register('VessieDesktop', this, { kind: 'desktop-environment' });
  },

  open() {
    if (!this.pane) return { ok: false, err: 'desktop_not_mounted' };
    this.wasFull = FullscreenUI.isFull();
    UI.setTab('desktop');
    this.pane.classList.add('rs-on');
    const app = UI.$('.rs-app');
    app.classList.add('rs-desktop-mode');
    FullscreenUI.setFull(true);
    this.startOpen = false;
    return { ok: true };
  },

  exit() {
    const app = UI.$('.rs-app');
    if (!app?.classList.contains('rs-desktop-mode')) return { ok: false, err: 'desktop_not_open' };
    this.pane.classList.remove('rs-on');
    app.classList.remove('rs-desktop-mode');
    FullscreenUI.setFull(this.wasFull);
    UI.setTab('editor');
    this.closeStartMenu();
    return { ok: true };
  },

  updateClock() {
    const clock = this.shell?.querySelector('[data-desktop-clock]');
    if (clock) {
      const now = new Date();
      clock.dateTime = now.toISOString();
      clock.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(now);
    }
  },

  closeStartMenu() {
    const menu = this.shell?.querySelector('[data-start-menu]');
    const button = this.shell?.querySelector('[data-desktop-action="start"]');
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
    this.startOpen = false;
  },

  onClick(event) {
    const open = event.target.closest('[data-open-app]');
    if (open) {
      event.preventDefault();
      this.closeStartMenu();
      this.launch(open.dataset.openApp);
      return;
    }
    const start = event.target.closest('[data-desktop-action="start"]');
    if (start) {
      this.startOpen = !this.startOpen;
      this.shell.querySelector('[data-start-menu]').hidden = !this.startOpen;
      start.setAttribute('aria-expanded', String(this.startOpen));
      return;
    }
    const action = event.target.closest('[data-window-action]');
    const win = action?.closest('.vessie-window');
    if (action && win) {
      const operation = action.dataset.windowAction;
      if (operation === 'close') this.closeWindow(win.dataset.app);
      else if (operation === 'minimize') win.hidden = true;
      else if (operation === 'maximize') win.classList.toggle('is-maximized');
      this.refreshTaskbar();
      return;
    }
    const runCode = event.target.closest('[data-run-code]');
    if (runCode) this.runCode();
    const clearCode = event.target.closest('[data-clear-code]');
    if (clearCode) {
      const output = this.shell.querySelector('[data-code-output]');
      output.textContent = 'Saída limpa.';
      output.dataset.error = 'false';
    }
    const terminal = event.target.closest('[data-run-terminal]');
    if (terminal) this.runTerminalCommand();
    if (!event.target.closest('.vessie-start-menu') && !start) this.closeStartMenu();
  },

  onKeydown(event) {
    if (event.key === 'Enter' && event.target.matches('[data-terminal-input]')) {
      event.preventDefault();
      this.runTerminalCommand();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target.matches('[data-code-editor]')) {
      event.preventDefault();
      this.runCode();
    }
    if (event.key === 'Escape' && event.target.closest('.vessie-window')) {
      event.stopPropagation();
      this.closeStartMenu();
    }
  },

  launch(appName) {
    if (appName === 'writing') {
      this.exit();
      UI.setTab('vessie');
      return { ok: true };
    }
    if (appName === 'games') {
      this.exit();
      return GameMode.open();
    }
    if (!['code', 'os'].includes(appName)) return { ok: false, err: 'unknown_app' };
    let win = this.windows.get(appName);
    if (win) {
      win.hidden = false;
      this.focusWindow(win);
      if (appName === 'os') this.shell.querySelector('[data-terminal-input]')?.focus();
      return { ok: true };
    }
    win = this.createWindow(appName);
    this.windows.set(appName, win);
    this.shell.appendChild(win);
    this.focusWindow(win);
    if (appName === 'os') this.shell.querySelector('[data-terminal-input]')?.focus();
    this.refreshTaskbar();
    return { ok: true };
  },

  createWindow(appName) {
    const isCode = appName === 'code';
    const title = isCode ? 'VessieScript · Editor' : 'VessieOS · Terminal virtual';
    const icon = isCode ? '🧑‍💻' : '💻';
    const win = document.createElement('section');
    win.className = 'vessie-window';
    win.dataset.app = appName;
    win.setAttribute('aria-label', title);
    win.innerHTML = `
      <header class="vessie-window-titlebar">
        <span aria-hidden="true">${icon}</span><span class="vessie-window-title">${title}</span>
        <button class="vessie-window-action" type="button" data-window-action="minimize" aria-label="Minimizar">─</button>
        <button class="vessie-window-action" type="button" data-window-action="maximize" aria-label="Maximizar">□</button>
        <button class="vessie-window-action" type="button" data-window-action="close" aria-label="Fechar">×</button>
      </header>
      ${isCode ? `
        <div class="vessie-window-content">
          <div class="vessie-window-toolbar">
            <button type="button" data-run-code>▶ Executar</button>
            <button type="button" data-clear-code>Limpar saída</button>
            <span class="vessie-window-hint">Ctrl+Enter para executar · VessieScript 1.0</span>
          </div>
          <textarea class="vessie-code-editor" data-code-editor aria-label="Código VessieScript" spellcheck="false"></textarea>
          <div class="vessie-code-output" data-code-output aria-live="polite">A saída do programa aparece aqui.</div>
        </div>` : `
        <div class="vessie-window-content">
          <div class="vessie-window-hint">Terminal isolado · arquivos somente na memória desta sessão</div>
          <pre class="vessie-os-console" data-os-console aria-live="polite"></pre>
          <input class="vessie-terminal-input" data-terminal-input aria-label="Comando do terminal" autocomplete="off" spellcheck="false" placeholder="Digite help e pressione Enter"/>
        </div>`}`;
    const titlebar = win.querySelector('.vessie-window-titlebar');
    titlebar.addEventListener('pointerdown', event => this.startDrag(event, win));
    win.addEventListener('pointerdown', () => this.focusWindow(win));
    if (isCode) {
      win.querySelector('[data-code-editor]').value = [
        '# VessieScript: variáveis, texto e contas sem executar JavaScript.',
        'let nome = "mundo"',
        'let total = 6 * (4 + 2)',
        'print "Olá, " + nome + "!"',
        'print "O resultado é " + total'
      ].join('\n');
    } else {
      this.fileSystem = this.fileSystem || new Map([
        ['README.txt', 'VessieOS é uma simulação educacional. Nenhum comando acessa o sistema operacional real.'],
        ['notas.txt', 'Seus arquivos virtuais existem somente nesta sessão do navegador.']
      ]);
      this.directories = this.directories || new Set(['documentos']);
      this.appendTerminal('VessieOS 1.0 · ambiente virtual iniciado.');
      this.appendTerminal('Digite help para ver os comandos disponíveis.');
    }
    return win;
  },

  startDrag(event, win) {
    if (event.button !== 0 || event.target.closest('button') || win.classList.contains('is-maximized')) return;
    event.preventDefault();
    const rect = win.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = rect.left;
    const originY = rect.top;
    const move = moveEvent => {
      const maxX = Math.max(0, innerWidth - Math.min(160, rect.width));
      const maxY = Math.max(0, innerHeight - Math.min(80, rect.height));
      win.style.left = `${Math.min(maxX, Math.max(0, originX + moveEvent.clientX - startX))}px`;
      win.style.top = `${Math.min(maxY, Math.max(0, originY + moveEvent.clientY - startY))}px`;
    };
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  },

  focusWindow(win) {
    win.style.zIndex = String(++this.nextZ);
    this.windows.forEach(item => item.classList.toggle('is-focused', item === win));
    this.refreshTaskbar();
  },

  closeWindow(appName) {
    const win = this.windows.get(appName);
    if (!win) return;
    win.remove();
    this.windows.delete(appName);
    this.refreshTaskbar();
  },

  refreshTaskbar() {
    this.shell?.querySelectorAll('[data-open-app]').forEach(button => {
      const appName = button.dataset.openApp;
      const win = this.windows.get(appName);
      button.classList.toggle('is-active', !!win && !win.hidden);
    });
  },

  runCode() {
    const source = this.shell.querySelector('[data-code-editor]')?.value || '';
    const output = this.shell.querySelector('[data-code-output]');
    try {
      const result = VessieLanguage.run(source);
      output.textContent = result.output.length ? result.output.join('\n') : 'Programa executado sem saída.';
      output.dataset.error = 'false';
    } catch (error) {
      output.textContent = error.message;
      output.dataset.error = 'true';
    }
  },

  appendTerminal(text) {
    const consoleArea = this.shell?.querySelector('[data-os-console]');
    if (!consoleArea) return;
    consoleArea.textContent += `${consoleArea.textContent ? '\n' : ''}${text}`;
    consoleArea.scrollTop = consoleArea.scrollHeight;
  },

  runTerminalCommand() {
    const input = this.shell.querySelector('[data-terminal-input]');
    const commandLine = input.value.trim();
    if (!commandLine) return;
    input.value = '';
    this.appendTerminal(`user@vessie:~$ ${commandLine}`);
    const [command, ...args] = commandLine.split(/\s+/u);
    const fs = this.fileSystem || new Map();
    const validName = name => /^[A-Za-z0-9._-]{1,64}$/u.test(name) && name !== '.' && name !== '..';
    let result = '';
    switch (command.toLowerCase()) {
      case 'help':
      case '?':
        result = 'help | ls | pwd | date | about | cat <arquivo> | touch <arquivo> | write <arquivo> <texto> | mkdir <pasta> | clear';
        break;
      case 'ls':
        result = [...fs.keys(), ...[...this.directories].map(name => `${name}/`)].join('  ') || '(diretório vazio)';
        break;
      case 'pwd':
        result = '/home/user';
        break;
      case 'date':
        result = new Date().toLocaleString('pt-BR');
        break;
      case 'about':
        result = 'VessieOS é um simulador didático no navegador. Não é um sistema operacional real; não acessa arquivos do computador, rede ou processos do dispositivo.';
        break;
      case 'cat': {
        const filename = args[0];
        result = filename && fs.has(filename) ? fs.get(filename) : `Arquivo não encontrado: ${filename || '(nome ausente)'}`;
        break;
      }
      case 'touch': {
        const filename = args[0];
        if (!filename || !validName(filename)) result = 'Nome inválido. Use letras, números, ponto, hífen ou sublinhado.';
        else {
          if (!fs.has(filename)) fs.set(filename, '');
          result = `Arquivo virtual pronto: ${filename}`;
        }
        break;
      }
      case 'write': {
        const filename = args[0];
        if (!filename || !validName(filename)) result = 'Uso: write <arquivo> <texto>';
        else if (args.slice(1).join(' ').length > 4000) result = 'O texto do arquivo deve ter até 4.000 caracteres.';
        else {
          fs.set(filename, args.slice(1).join(' '));
          result = `Escrito no arquivo virtual ${filename}.`;
        }
        break;
      }
      case 'mkdir':
        if (!args[0] || !validName(args[0])) result = 'Uso: mkdir <nome-simples>';
        else if (this.directories.has(args[0])) result = `A pasta já existe: ${args[0]}/`;
        else {
          this.directories.add(args[0]);
          result = `Pasta virtual criada: ${args[0]}/`;
        }
        break;
      case 'clear': {
        const area = this.shell.querySelector('[data-os-console]');
        area.textContent = '';
        break;
      }
      default:
        result = `Comando desconhecido: ${command}. Digite help.`;
    }
    if (result) this.appendTerminal(result);
  },

  api() {
    return {
      open: () => this.open(),
      exit: () => this.exit(),
      launch: appName => this.launch(appName),
      run: source => VessieLanguage.run(source),
      apps: () => [...this.windows.keys()]
    };
  },

  destroy() {
    this.abortController?.abort();
    clearInterval(this.clockInterval);
    this.windows.clear();
  }
};

/* ── LM-00 · Cliente LM Studio (OpenAI-compatible) + config + cache + log ──
   Requer LM Studio com servidor local ativo (ex.: http://localhost:1234/v1).
   Se o navegador recusar (CORS/rede), status() retorna {ok:false} com dica. */

const LmConfig = {
  defaults: { baseUrl: 'http://localhost:1234/v1', model: '', timeoutMs: 60000, maxTokens: 900, temperature: 0.3 },
  get() {
    try {
      const saved = (Store.data && Store.data.lm) || {};
      const cfg = { ...this.defaults, ...saved };
      // Integração com o runtime Vessie: usa endpoint/modelo dele quando o Store ainda não tem.
      try {
        if (!saved.baseUrl && typeof Vessie !== 'undefined' && Vessie.state?.config?.lmEndpoint) cfg.baseUrl = Vessie.state.config.lmEndpoint;
        if (!saved.model && typeof Vessie !== 'undefined' && Vessie.state?.config?.lmModel) cfg.model = Vessie.state.config.lmModel;
      } catch {}
      return cfg;
    } catch { return { ...this.defaults }; }
  },
  set(patch) {
    const cur = this.get();
    Object.assign(cur, patch || {});
    try { Store.data.lm = cur; Store.save(); } catch {}
    try { EventBus.emit('lm:config', { ...cur }); } catch {}
    return cur;
  }
};

const LmClient = {
  _modelsCache: null, _modelsAt: 0,
  url(path) { return LmConfig.get().baseUrl.replace(/\/+$/, '') + path; },
  async _fetch(path, opts = {}) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), LmConfig.get().timeoutMs);
    try {
      const r = await fetch(this.url(path), { ...opts, signal: ctl.signal });
      return { ok: r.ok, status: r.status, body: await r.text() };
    } catch (e) {
      return { ok: false, status: 0, err: String(e && e.message || e) };
    } finally { clearTimeout(to); }
  },
  hint() {
    return 'Verifique: 1) LM Studio aberto com servidor local ligado; '
      + '2) baseUrl confere (LmConfig.set({baseUrl})) e modelo carregado; '
      + '3) se a página bloquear (CORS/mixed-content), abra o painel em aba http ou localhost.';
  },
  async status() {
    const r = await this._fetch('/models');
    if (!r.ok) return { ok: false, err: r.err || ('http_' + r.status), hint: this.hint() };
    try {
      const j = JSON.parse(r.body);
      const ids = (j.data || []).map(m => m.id);
      this._modelsCache = ids; this._modelsAt = Date.now();
      return { ok: true, models: ids };
    } catch (e) { return { ok: false, err: 'bad_json', hint: this.hint() }; }
  },
  async models(force = false) {
    if (!force && this._modelsCache && Date.now() - this._modelsAt < 60000) return { ok: true, models: this._modelsCache };
    return this.status();
  },
  async chat(messages, opts = {}) {
    const cfg = LmConfig.get();
    const model = opts.model || cfg.model || undefined;
    const st = model ? null : await this.models();
    const finalModel = model || (st && st.models && st.models[0]) || '';
    if (!finalModel) return { ok: false, err: 'no_model', hint: 'Carregue um modelo no LM Studio primeiro. ' + this.hint() };
    const r = await this._fetch('/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: finalModel,
        messages,
        temperature: opts.temperature ?? cfg.temperature,
        max_tokens: opts.maxTokens ?? cfg.maxTokens
      })
    });
    if (!r.ok) return { ok: false, err: r.err || ('http_' + r.status), hint: this.hint() };
    try {
      const j = JSON.parse(r.body);
      const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
      if (!text) return { ok: false, err: 'empty_reply', hint: this.hint() };
      return { ok: true, text, model: finalModel };
    } catch (e) { return { ok: false, err: 'bad_json', hint: this.hint() }; }
  },
  ask(prompt, system = '', opts = {}) {
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    msgs.push({ role: 'user', content: prompt });
    return this.chat(msgs, opts);
  }
};

const LmCache = {
  _m: new Map(), _max: 50,
  key(cmd, text) { return cmd + '::' + String(text).slice(0, 200); },
  get(cmd, text) { return this._m.get(this.key(cmd, text)) || null; },
  set(cmd, text, val) {
    this._m.set(this.key(cmd, text), val);
    if (this._m.size > this._max) this._m.delete(this._m.keys().next().value);
  },
  clear() { this._m.clear(); }
};

const LmLog = {
  _items: [], _max: 200,
  push(e) {
    this._items.unshift({ t: new Date().toISOString(), ...(e || {}) });
    if (this._items.length > this._max) this._items.length = this._max;
    try { EventBus.emit('lm:log', e); } catch {}
  },
  list() { return this._items.slice(); },
  clear() { this._items = []; },
  export() { try { Utils.download('lm-log.json', Utils.safeJson(this._items), 'application/json'); return { ok: true }; } catch (e) { return { ok: false, err: e.message }; } }
};

ModuleRegistry.register('LmConfig', LmConfig, { kind: 'lm' });
ModuleRegistry.register('LmClient', LmClient, { kind: 'lm' });
ModuleRegistry.register('LmCache', LmCache, { kind: 'lm' });
ModuleRegistry.register('LmLog', LmLog, { kind: 'lm' });

/* ── LM-01 · Catálogo de comandos de IA + executor ── */

const LmCommands = {
  SYS_PT: 'Você é um professor de redação para ENEM/vestibulares. Responda em português, direto e aplicável ao texto do aluno.',
  items: [
    { id: 'melhorar', title: 'Melhorar texto', desc: 'Reescreve com norma culta e coesão.',
      system: 'Você é um professor de redação. Reescreva o texto em norma culta, mantendo as ideias.',
      build: t => `Melhore este texto, mantendo as ideias:\n\n${t}` },
    { id: 'continuar', title: 'Continuar', desc: 'Gera o próximo parágrafo no mesmo tom.',
      system: 'Você é um professor de redação. Continue o texto com um parágrafo coeso.',
      build: t => `Continue este texto com um parágrafo:\n\n${t}` },
    { id: 'resumir', title: 'Resumir', desc: 'Síntese em 3–5 linhas.',
      system: 'Você resume textos de alunos de forma fiel e curta.',
      build: t => `Resuma em 3 a 5 linhas:\n\n${t}` },
    { id: 'tese', title: 'Criar tese', desc: 'Tese + 2 argumentos a partir do tema.',
      system: 'Você cria teses dissertativo-argumentativas claras.',
      build: t => `Crie 1 tese e 2 argumentos para o tema: ${t}` },
    { id: 'argumentos', title: 'Expandir argumentos', desc: 'Aprofunda os argumentos do texto.',
      system: 'Você desenvolve argumentos com causa, consequência e repertório.',
      build: t => `Liste e aprofunde os argumentos deste texto, sugerindo repertório para cada um:\n\n${t}` },
    { id: 'intervencao', title: 'Proposta de intervenção', desc: 'Agente+ação+meio+finalidade.',
      system: 'Você monta propostas de intervenção completas (agente, ação, meio, finalidade, detalhamento).',
      build: t => `Monte uma proposta de intervenção completa para o problema deste texto:\n\n${t}` },
    { id: 'gramatica', title: 'Corrigir gramática', desc: 'Aponta erros e explica.',
      system: 'Você corrige gramática e explica cada correção de forma breve.',
      build: t => `Corrija a gramática e explique cada correção:\n\n${t}` },
    { id: 'formalizar', title: 'Formalizar', desc: 'Remove oralidade e vícios.',
      system: 'Você formaliza textos, removendo oralidade, gerundismo e clichês.',
      build: t => `Formalize este texto (sem oralidade nem clichês):\n\n${t}` },
    { id: 'simplificar', title: 'Simplificar', desc: 'Frases curtas e claras.',
      system: 'Você simplifica frases longas sem perder o sentido.',
      build: t => `Simplifique as frases longas deste texto:\n\n${t}` },
    { id: 'expandir', title: 'Expandir', desc: 'Adiciona repertório e detalhes.',
      system: 'Você expande textos com repertório sociocultural pertinente.',
      build: t => `Expanda este texto com repertório e detalhamento:\n\n${t}` },
    { id: 'titulos', title: 'Sugerir títulos', desc: '5 opções de título.',
      system: 'Você sugere títulos curtos e adequados.',
      build: t => `Sugira 5 títulos para este texto:\n\n${t}` },
    { id: 'conectivos', title: 'Revisar conectivos', desc: 'Sugere articuladores por parágrafo.',
      system: 'Você revisa coesão e sugere conectivos adequados por parágrafo.',
      build: t => `Revise a coesão e sugira conectivos por parágrafo:\n\n${t}` }
  ],
  list() { return this.items.map(c => ({ id: c.id, title: c.title, desc: c.desc })); },
  get(id) { return this.items.find(c => c.id === id) || null; }
};

const LmRunner = {
  async run(id, text, opts = {}) {
    const cmd = LmCommands.get(id);
    if (!cmd) return { ok: false, err: 'unknown_command' };
    let src = text ?? (() => { try { return EditorObject.getText(); } catch { return ''; } })();
    src = String(src || '');
    if (!src.trim()) return { ok: false, err: 'empty', hint: 'Escreva ou cole um texto no editor primeiro.' };
    if (!opts.skipCache) {
      const hit = LmCache.get(id, src);
      if (hit) return { ok: true, text: hit, cached: true };
    }
    const t0 = Date.now();
    const r = await LmClient.ask(cmd.build(src.slice(0, 6000), opts), cmd.system || LmCommands.SYS_PT, opts);
    LmLog.push({ cmd: id, ms: Date.now() - t0, ok: r.ok, err: r.err || null });
    if (r.ok) {
      LmCache.set(id, src, r.text);
      try { EventBus.emit('lm:done', { cmd: id }); } catch {}
    }
    return r;
  },
  // Atalhos práticos
  melhorar: (t, o) => LmRunner.run('melhorar', t, o),
  continuar: (t, o) => LmRunner.run('continuar', t, o),
  gramatica: (t, o) => LmRunner.run('gramatica', t, o)
};

ModuleRegistry.register('LmCommands', LmCommands, { kind: 'lm' });
ModuleRegistry.register('LmRunner', LmRunner, { kind: 'lm' });

/* ── LM-02 · IA aplicada à redação (métricas locais + LM Studio) ── */

const RedacaoAI = {
  _metrics(text) {
    try { return ResultSchema.build(text); }
    catch {
      // Fallback: resumo do runtime Vessie (60 métricas) quando ResultSchema não está pronto.
      try {
        if (typeof Vessie !== 'undefined') {
          const rep = Vessie.analyze(text);
          return { metrics: { words: rep.counts.words }, readability: null, lexical: { diversity: rep.counts.lexicalDiversity }, style: null, vices: [], vessieSummary: rep.summary };
        }
      } catch {}
      return { metrics: { words: RsUtils.words(text) } };
    }
  },
  _clip(t, n = 5000) { return String(t || '').slice(0, n); },
  feedback(text, opts = {}) {
    const src = String((text ?? (() => { try { return EditorObject.getText(); } catch { return ''; } })()) || '');
    if (!src.trim()) return Promise.resolve({ ok: false, err: 'empty' });
    const m = this._metrics(src);
    const vessie = m.vessieSummary ? `Resumo Vessie por grupo: ${JSON.stringify(m.vessieSummary)}. ` : '';
    const prompt = `Avalie esta redação no padrão ENEM (C1–C5, até 200 pontos cada). Métricas locais: `
      + `${m.metrics.words} palavras, Flesch-pt ${m.readability?.fleschPt ?? '?'}, `
      + `diversidade ${m.lexical?.diversity ?? '?'}%, estilo ${m.style?.score ?? '?'}/100, `
      + `vícios: ${(m.vices || []).length}. ${vessie}Dê nota estimada por competência, 3 pontos fortes e 3 correções prioritárias.\n\nTEXTO:\n${this._clip(src)}`;
    return LmClient.ask(prompt, LmCommands.SYS_PT + ' Avalie como corretor ENEM.', opts);
  },
  async gradeEssay(text, opts = {}) {
    const r = await this.feedback(text, opts);
    if (!r.ok) return r;
    const nums = r.text.match(/\b([0-9]{2,3})\b/g) || [];
    const total = nums.map(Number).filter(n => n <= 200).slice(0, 5).reduce((a, b) => a + b, 0);
    return { ...r, parsedTotal: total || null };
  },
  suggestRepertoire(theme, opts = {}) {
    const th = String(theme || 'tema da redação');
    let local = '';
    try {
      const s = ThemeRepertoire.suggest(th);
      local = `Sugestões do banco local (${s.axis}): ${s.repertoire.join(' | ')}.`;
    } catch {}
    return LmClient.ask(
      `Para o tema "${th}", indique 3 repertórios socioculturais (1 lei/documento, 1 pensador/obra, 1 filme/dado), `
      + `explicando em 2 frases cada como ligar à tese. ${local}`,
      LmCommands.SYS_PT, opts);
  },
  skeletonAI(theme, opts = {}) {
    const th = String(theme || 'tema da redação');
    return LmClient.ask(
      `Monte um esqueleto ENEM (introdução + 2 desenvolvimentos + conclusão com intervenção completa) para: "${th}".`,
      LmCommands.SYS_PT, opts);
  },
  insertResult(aiText) {
    try { EditorCore.insert(String(aiText || '')); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message }; }
  }
};

ModuleRegistry.register('RedacaoAI', RedacaoAI, { kind: 'lm' });

/* ── LM-03 · Escrita assistida (regras locais; IA opcional via LmRunner) ── */

const Paraphraser = {
  paraphrase(text) {
    const t = String(text ?? '');
    const changes = [];
    const out = t.split(/(?<=[.!?…])\s+/).map(sent => {
      const words = sent.split(/(\s+)/);
      let replaced = 0;
      const nw = words.map(w => {
        if (replaced >= 2 || !/^[\p{L}]{5,}$/u.test(w)) return w;
        let syns = [];
        try { syns = SynonymsBank.suggest(w.toLowerCase()); } catch {}
        if (!syns.length) return w;
        replaced++;
        changes.push({ from: w, to: syns[0] });
        return /^[A-ZÁ]/.test(w) ? syns[0].charAt(0).toUpperCase() + syns[0].slice(1) : syns[0];
      });
      return nw.join('');
    }).join(' ');
    return { text: out, changes: changes.slice(0, 12) };
  }
};

const ConnectorSuggester = {
  suggest(relation = '') {
    const q = String(relation).toLowerCase();
    try {
      for (const [group, list] of Object.entries(ConnectivesBank.groups)) {
        if (!q || group.toLowerCase().includes(q) || list.some(c => c.includes(q))) return { group, options: list };
      }
    } catch {}
    return { group: 'Conclusão', options: ['portanto', 'assim', 'em suma'] };
  }
};

const CohesionHelper = {
  check(text) {
    const paras = String(text ?? '').split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    let all = [];
    try { all = Object.values(ConnectivesBank.groups).flat().map(c => c.toLowerCase()); } catch {}
    return paras.map((p, i) => {
      if (i === 0) return { para: i + 1, ok: true, note: 'abertura' };
      const start = p.slice(0, 40).toLowerCase();
      const hit = all.find(c => start.startsWith(c));
      return hit
        ? { para: i + 1, ok: true, note: `articulado com "${hit}"` }
        : { para: i + 1, ok: false, note: 'sem articulador no início — considere: ' + ConnectorSuggester.suggest('conclusão').options.slice(0, 3).join(', ') };
    });
  }
};

const IntroBuilder = {
  build(theme = 'tema', thesis = 'tese') {
    return `No Brasil contemporâneo, ${theme} revela-se um desafio persistente. `
      + `Isso ocorre porque ${thesis}. Diante disso, é necessário analisar as causas e os impactos desse impasse.`;
  }
};

const ConclusionBuilder = {
  build(fields = {}) {
    try { return InterventionBuilder.build(fields); }
    catch { return { text: '', missing: [], complete: false }; }
  }
};

const VocabularyCoach = {
  coach(text, n = 8) {
    let lex = null;
    try { lex = LexicalAnalyzer.analyze(text, n); } catch { return { repeats: [], suggestions: [] }; }
    const suggestions = (lex.repeats || []).map(w => {
      let syns = [];
      try { syns = SynonymsBank.suggest(w); } catch {}
      return { word: w, synonyms: syns.slice(0, 3) };
    });
    return { diversity: lex.diversity, top: lex.top, suggestions };
  }
};

ModuleRegistry.register('Paraphraser', Paraphraser, { kind: 'writing' });
ModuleRegistry.register('ConnectorSuggester', ConnectorSuggester, { kind: 'writing' });
ModuleRegistry.register('CohesionHelper', CohesionHelper, { kind: 'writing' });
ModuleRegistry.register('IntroBuilder', IntroBuilder, { kind: 'writing' });
ModuleRegistry.register('ConclusionBuilder', ConclusionBuilder, { kind: 'writing' });
ModuleRegistry.register('VocabularyCoach', VocabularyCoach, { kind: 'writing' });

/* ── LM-04 · Produtividade extra (metas, streak, notas, marcos, brief, pacote) ── */

const GoalWizard = {
  suggest() {
    let avg = 0;
    try {
      const w = ProgressTracker.week();
      avg = Math.round(w.reduce((a, d) => a + (d.words || 0), 0) / 7);
    } catch {}
    const goal = Math.max(200, Math.round((avg || 350) / 50) * 50);
    return { avgWeek: avg, suggestedDailyWords: goal, hint: `Média semanal: ${avg} palavras/dia.` };
  },
  apply() {
    const s = this.suggest();
    try { GoalsManager.set({ dailyWords: s.suggestedDailyWords }); } catch {}
    return s;
  }
};

const StreakBoard = {
  days(n = 14) {
    const out = [];
    try {
      RsStoreExt.ensure();
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const k = RsUtils.todayKey(d);
        const e = Store.data.daily[k] || { words: 0 };
        out.push({ key: k, words: e.words || 0, active: (e.words || 0) > 0 });
      }
    } catch {}
    return out;
  }
};

const SessionNotes = {
  key(d = new Date()) { return RsUtils.todayKey(d); },
  get(dateKey) {
    try {
      RsStoreExt.ensure();
      Store.data.sessionNotes = Store.data.sessionNotes || {};
      return Store.data.sessionNotes[dateKey || this.key()] || '';
    } catch { return ''; }
  },
  set(text, dateKey) {
    try {
      RsStoreExt.ensure();
      Store.data.sessionNotes = Store.data.sessionNotes || {};
      Store.data.sessionNotes[dateKey || this.key()] = String(text || '');
      Store.save();
      return { ok: true };
    } catch (e) { return { ok: false, err: e.message }; }
  }
};

const WordMilestones = {
  steps: [100, 200, 300, 500, 800, 1000],
  status(text) {
    const words = RsUtils.words(text ?? (() => { try { return EditorObject.getText(); } catch { return ''; } })());
    const next = this.steps.find(s => s > words) || null;
    return { words, next, pct: next ? Math.round(words / next * 100) : 100, done: !next };
  }
};

const DailyBrief = {
  markdown() {
    const L = ['# Brief do dia — Redação Studio', ''];
    try {
      const g = GoalsManager.status();
      L.push(`- Meta diária: ${g.today.words}/${g.goals.dailyWords} palavras (${g.dailyPct}%)${g.met ? ' ✅' : ''}`);
      L.push(`- Streak: ${ProgressTracker.streak()} dia(s)`);
    } catch {}
    try {
      const drill = TrainingDrills.pick();
      L.push(`- Treino sugerido: ${drill.title} — ${drill.task}`);
    } catch {}
    try {
      const th = EssayThemes.random();
      const rep = ThemeRepertoire.suggest(th.title);
      L.push(`- Tema do dia: ${th.title}`);
      L.push(`- Repertório inicial (${rep.axis}): ${rep.repertoire.join(' | ')}`);
    } catch {}
    return L.join('\n');
  }
};

const ExportBundle = {
  download() {
    const text = (() => { try { return EditorObject.getText(); } catch { return ''; } })();
    const parts = ['# Pacote — Redação Studio', '', '## Texto', '', text || '(vazio)', ''];
    try { parts.push('## Brief', '', DailyBrief.markdown(), ''); } catch {}
    try { parts.push('## Relatório', '', MarkdownExporter.report(ResultSchema.build(text)), ''); } catch {}
    try { Utils.download('pacote-redacao.md', parts.join('\n'), 'text/markdown'); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message }; }
  }
};

ModuleRegistry.register('GoalWizard', GoalWizard, { kind: 'productivity' });
ModuleRegistry.register('StreakBoard', StreakBoard, { kind: 'productivity' });
ModuleRegistry.register('SessionNotes', SessionNotes, { kind: 'productivity' });
ModuleRegistry.register('WordMilestones', WordMilestones, { kind: 'productivity' });
ModuleRegistry.register('DailyBrief', DailyBrief, { kind: 'productivity' });
ModuleRegistry.register('ExportBundle', ExportBundle, { kind: 'export' });

/* ── LM-05 · Conteúdo extra (citações, dados, argumentos, contra-argumentos, atualidades) ──
   Citações marcadas como "exata" são de autoria amplamente documentada; as demais
   são paráfrases fiéis da ideia central — sempre confira antes de citar na redação. */

const QuoteBank = {
  items: [
    { kind: 'exata', text: 'Se a educação sozinha não transforma a sociedade, sem ela tampouco a sociedade muda.', author: 'Paulo Freire', work: 'Pedagogia da Autonomia', themes: ['educação'] },
    { kind: 'exata', text: 'A educação é a arma mais poderosa que você pode usar para mudar o mundo.', author: 'Nelson Mandela', work: 'Discurso (2003)', themes: ['educação', 'desigualdade'] },
    { kind: 'exata', text: 'Não se nasce mulher, torna-se mulher.', author: 'Simone de Beauvoir', work: 'O Segundo Sexo', themes: ['gênero'] },
    { kind: 'exata', text: 'O homem nasce livre, e por toda parte encontra-se a ferros.', author: 'Jean-Jacques Rousseau', work: 'O Contrato Social', themes: ['liberdade', 'desigualdade'] },
    { kind: 'exata', text: 'A história se repete, a primeira vez como tragédia e a segunda como farsa.', author: 'Karl Marx', work: 'O 18 de Brumário', themes: ['história', 'política'] },
    { kind: 'exata', text: 'Conhece-te a ti mesmo.', author: 'Sócrates (máxima de Delfos)', work: 'Tradição socrática', themes: ['conhecimento'] },
    { kind: 'parafrase', text: 'Ideia central: o capital cultural herdado reproduz desigualdades escolares.', author: 'Pierre Bourdieu', work: 'A Distinção', themes: ['educação', 'desigualdade'] },
    { kind: 'parafrase', text: 'Ideia central: o poder disciplinar vigia e normaliza corpos nas instituições.', author: 'Michel Foucault', work: 'Vigiar e Punir', themes: ['poder', 'instituições'] },
    { kind: 'parafrase', text: 'Ideia central: na modernidade líquida, consumir virou forma de pertencimento.', author: 'Zygmunt Bauman', work: 'Vida para Consumo', themes: ['consumo'] },
    { kind: 'parafrase', text: 'Ideia central: o território usado revela as desigualdades da globalização.', author: 'Milton Santos', work: 'Por uma Outra Globalização', themes: ['cidade', 'desigualdade'] },
    { kind: 'parafrase', text: 'Ideia central: falar a partir do próprio lugar importa no debate sobre opressões.', author: 'Djamila Ribeiro', work: 'Lugar de Fala', themes: ['gênero', 'igualdade'] },
    { kind: 'parafrase', text: 'Ideia central: a cordialidade personalista fragiliza instituições impessoais.', author: 'Sérgio Buarque de Holanda', work: 'Raízes do Brasil', themes: ['cultura', 'política'] }
  ],
  find(term = '') {
    const q = String(term).toLowerCase();
    return this.items.filter(i => !q || (i.text + ' ' + i.author + ' ' + i.themes.join(' ')).toLowerCase().includes(q));
  }
};

const DataBank = {
  // Guia honesto: onde buscar + como citar. Valores marcados EXEMPLO devem ser substituídos.
  sources: [
    { name: 'IBGE — PNAD Contínua', use: 'Renda, trabalho, educação e moradia.', url: 'https://www.ibge.gov.br' },
    { name: 'INEP — Censo Escolar', use: 'Matrícula, evasão e infraestrutura escolar.', url: 'https://www.gov.br/inep' },
    { name: 'IPEA — Atlas da Violência', use: 'Homicídios por raça, gênero e território.', url: 'https://www.ipea.gov.br/atlasviolencia' },
    { name: 'DATASUS', use: 'Saúde pública e saneamento.', url: 'https://datasus.saude.gov.br' },
    { name: 'ONU/OMS/UNICEF (relatórios)', use: 'Clima, infância e desenvolvimento.', url: 'https://www.un.org' }
  ],
  examples: [
    { frame: 'EXEMPLO — substitua pelo dado atual do IBGE: "segundo a PNAD Contínua (IBGE, ANO), X% dos...".', verify: true },
    { frame: 'EXEMPLO — substitua pelo Atlas da Violência (IPEA, ANO) ao tratar de raça/gênero e homicídios.', verify: true }
  ]
};

const ArgumentBank = {
  axes: {
    'educação': { causa: ['Subfinanciamento e desigualdade entre redes', 'Evasão ligada ao trabalho precoce'], consequencia: ['Reprodução da desigualdade de renda', 'Baixa mobilidade social'] },
    'desigualdade': { causa: ['Herança histórica escravocrata', 'Concentração de renda e terra'], consequencia: ['Segregação territorial', 'Acesso desigual a serviços'] },
    'consumo': { causa: ['Publicidade e crédito fácil', 'Obsolescência programada'], consequencia: ['Endividamento', 'Impacto ambiental do descarte'] },
    'sustentabilidade': { causa: ['Modelo extrativista', 'Falta de coleta seletiva'], consequencia: ['Injustiça ambiental nas periferias', 'Escassez hídrica'] },
    'tecnologia': { causa: ['Plataformas movidas a engajamento', 'Exclusão digital'], consequencia: ['Desinformação e polarização', 'Prejuízos à saúde mental'] },
    'gênero': { causa: ['Cultura patriarcal', 'Dependência econômica'], consequencia: ['Subnotificação da violência', 'Sobrecarga do cuidado'] }
  },
  get(axis = '') { return this.axes[String(axis).toLowerCase()] || null; }
};

const CounterArgs = {
  techniques: [
    { name: 'Concessão + refutação', how: '"Embora se alegue X, os dados mostram Y, pois..."' },
    { name: 'Redução ao contexto', how: '"X vale em casos isolados, mas não explica o problema estrutural, dado que..."' },
    { name: 'Inversão do ônus', how: '"Se X fosse suficiente, o problema já estaria resolvido; logo..."' },
    { name: 'Qualificação', how: '"X é necessário, porém insuficiente sem Y, uma vez que..."' }
  ]
};

const Atualidades = {
  frames: [
    { frame: 'Regulação das plataformas e Cruzada contra desinformação', axes: ['tecnologia'] },
    { frame: 'Apostas online e endividamento', axes: ['consumo'] },
    { frame: 'Eventos climáticos extremos e adaptação das cidades', axes: ['sustentabilidade', 'cidade'] },
    { frame: 'Envelhecimento e reforma dos cuidados', axes: ['inclusão'] },
    { frame: 'IA generativa na escola e no trabalho', axes: ['tecnologia', 'educação', 'trabalho'] },
    { frame: 'Universalização do saneamento (Marco Legal)', axes: ['cidade'] },
    { frame: 'Cotas e permanência no ensino superior', axes: ['educação', 'igualdade'] },
    { frame: 'Saúde mental juvenil pós-pandemia', axes: ['tecnologia', 'inclusão'] }
  ],
  suggest(axis = '') {
    const q = String(axis).toLowerCase();
    return this.frames.filter(f => !q || f.axes.some(a => a.includes(q)));
  }
};

ModuleRegistry.register('QuoteBank', QuoteBank, { kind: 'content' });
ModuleRegistry.register('DataBank', DataBank, { kind: 'content' });
ModuleRegistry.register('ArgumentBank', ArgumentBank, { kind: 'content' });
ModuleRegistry.register('CounterArgs', CounterArgs, { kind: 'content' });
ModuleRegistry.register('Atualidades', Atualidades, { kind: 'content' });

/* ── LM-06 · Diagnóstico, logs, explorador de módulos e atalhos ── */

const ExtDiagnostics = {
  expected: ['LmConfig', 'LmClient', 'LmCache', 'LmLog', 'LmCommands', 'LmRunner', 'RedacaoAI',
    'Paraphraser', 'ConnectorSuggester', 'CohesionHelper', 'IntroBuilder', 'ConclusionBuilder',
    'VocabularyCoach', 'GoalWizard', 'StreakBoard', 'SessionNotes', 'WordMilestones', 'DailyBrief',
    'ExportBundle', 'QuoteBank', 'DataBank', 'ArgumentBank', 'CounterArgs', 'Atualidades',
    'ExtLogs', 'ModuleExplorer', 'ShortcutDocs', 'LmPanel', 'LmBridge'],
  checkLocal() {
    const fails = [];
    for (const n of this.expected) {
      try {
        const v = ModuleRegistry.get(n);
        if (!v) fails.push(n + ': ausente');
      } catch (e) { fails.push(n + ': ' + e.message); }
    }
    try {
      const s = SyllableCounter.countWord('casa');
      if (s !== 2) fails.push('SyllableCounter: inesperado=' + s);
    } catch (e) { fails.push('SyllableCounter: ' + e.message); }
    return { total: this.expected.length, fails };
  },
  async checkAll() {
    const local = this.checkLocal();
    let lm = { ok: false, skipped: true };
    try { lm = await LmClient.status(); } catch (e) { lm = { ok: false, err: e.message }; }
    return { ...local, lm: lm.ok ? { ok: true, models: lm.models } : { ok: false, err: lm.err, hint: lm.hint } };
  }
};

const ExtLogs = {
  session() {
    let hist = [];
    try { hist = Logger.history.slice(-50); } catch {}
    return { lm: LmLog.list().slice(0, 50), console: hist };
  },
  exportAll() {
    try {
      Utils.download('ext-logs.json', Utils.safeJson(this.session()), 'application/json');
      return { ok: true };
    } catch (e) { return { ok: false, err: e.message }; }
  }
};

const ModuleExplorer = {
  list() { try { return ModuleRegistry.list(); } catch { return []; } },
  describe() { try { return ModuleRegistry.describe(); } catch { return []; } },
  find(term = '') {
    const q = String(term).toLowerCase();
    return this.describe().filter(m => !q || (m.name + ' ' + (m.kind || '')).toLowerCase().includes(q));
  }
};

const ShortcutDocs = {
  list() {
    let base = [];
    try { base = ShortcutManager.conflicts(); } catch {}
    return {
      registered: base,
      lm: [
        { combo: 'ctrl+shift+l', action: 'Abrir/fechar painel LM' },
        { combo: 'ctrl+shift+m', action: 'Melhorar texto com IA' },
        { combo: 'ctrl+shift+g', action: 'Corrigir gramática com IA' }
      ],
      note: 'Atalhos LM ignoram campos de digitação, exceto o painel próprio.'
    };
  }
};

ModuleRegistry.register('ExtDiagnostics', ExtDiagnostics, { kind: 'devtools' });
ModuleRegistry.register('ExtLogs', ExtLogs, { kind: 'devtools' });
ModuleRegistry.register('ModuleExplorer', ModuleExplorer, { kind: 'devtools' });
ModuleRegistry.register('ShortcutDocs', ShortcutDocs, { kind: 'devtools' });

/* ── LM-07 · Painel flutuante do LM Studio (DOM puro, sem innerHTML) ── */

const LmPanel = {
  _root: null,
  _els: {},
  isOpen() { return !!this._root; },
  toggle() { return this.isOpen() ? this.close() : this.open(); },
  close() { try { this._root?.remove(); } catch {} this._root = null; return { ok: true }; },
  _t(tag, text, attrs = {}) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  },
  _btn(label, fn) {
    const b = this._t('button', label, { type: 'button' });
    b.addEventListener('click', () => { try { fn(); } catch (e) { this.say('Erro: ' + e.message, true); } });
    return b;
  },
  say(msg, isErr = false) {
    const o = this._els.out;
    if (!o) return;
    o.textContent = String(msg || '');
    o.setAttribute('data-err', isErr ? '1' : '0');
  },
  _busy(b) {
    const o = this._els.out;
    if (o && b) o.textContent = '⏳ Consultando o LM Studio…';
    (this._els.btns || []).forEach(x => { try { x.disabled = !!b; } catch {} });
  },
  async _runCmd(id) {
    this._busy(true);
    try {
      const r = await LmRunner.run(id, undefined, {});
      this.say(r.ok ? r.text : ('Falhou: ' + (r.err || '?') + (r.hint ? '\n' + r.hint : '')));
    } finally { this._busy(false); }
  },
  async _runAI(kind) {
    this._busy(true);
    try {
      const text = (() => { try { return EditorObject.getText(); } catch { return ''; } })();
      let r;
      if (kind === 'feedback') r = await RedacaoAI.feedback(text, {});
      else if (kind === 'grade') r = await RedacaoAI.gradeEssay(text, {});
      else r = await RedacaoAI.suggestRepertoire(text.slice(0, 120) || 'tema da redação', {});
      this.say(r.ok ? (r.text + (r.parsedTotal != null ? `\n\nEstimativa somada: ${r.parsedTotal}` : '')) : ('Falhou: ' + (r.err || '?') + (r.hint ? '\n' + r.hint : '')));
    } finally { this._busy(false); }
  },
  async refreshStatus() {
    const pill = this._els.status;
    if (pill) pill.textContent = '● verificando…';
    try {
      const s = await LmClient.status();
      if (pill) pill.textContent = s.ok ? `● online (${s.models.length} modelo(s): ${s.models.slice(0, 2).join(', ')})` : `● offline (${s.err})`;
      if (!s.ok) this.say('LM Studio inacessível: ' + (s.err || '?') + '\n' + (s.hint || ''), true);
      return s;
    } catch (e) {
      if (pill) pill.textContent = '● erro';
      return { ok: false, err: e.message };
    }
  },
  open() {
    if (this.isOpen()) return { ok: true };
    const cfg = LmConfig.get();
    const root = this._t('div', null, { id: 'lm-panel' });
    root.setAttribute('style', 'position:fixed;right:12px;bottom:12px;width:340px;max-height:70vh;display:flex;'
      + 'flex-direction:column;z-index:2147483646;background:#14161c;color:#e8eaf0;border:1px solid #333a4d;'
      + 'border-radius:10px;font:12px/1.5 system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)');
    const st = this._t('style', '#lm-panel header{cursor:move;display:flex;justify-content:space-between;align-items:center;'
      + 'padding:8px 10px;background:#1d2230;border-radius:10px 10px 0 0;font-weight:700}'
      + '#lm-panel .lm-body{padding:8px 10px;overflow:auto;display:flex;flex-direction:column;gap:6px}'
      + '#lm-panel input{width:100%;box-sizing:border-box;background:#0f1220;color:#e8eaf0;border:1px solid #333a4d;border-radius:6px;padding:5px 7px;font:inherit}'
      + '#lm-panel .lm-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}'
      + '#lm-panel button{background:#2a3350;color:#fff;border:0;border-radius:6px;padding:6px 8px;cursor:pointer;font:inherit}'
      + '#lm-panel button:hover{background:#37436b}#lm-panel button:disabled{opacity:.5}'
      + '#lm-panel pre{white-space:pre-wrap;background:#0f1220;border:1px solid #333a4d;border-radius:6px;padding:7px;margin:0;max-height:180px;overflow:auto}'
      + '#lm-panel pre[data-err="1"]{border-color:#b34444}#lm-panel .lm-status{color:#9fe8b8;font-size:11px}');
    const head = this._t('header');
    head.appendChild(this._t('span', '🤖 LM Studio · Redação'));
    const x = this._btn('✕', () => this.close());
    head.appendChild(x);
    const body = this._t('div', null, { class: 'lm-body' });
    const status = this._t('div', '● …', { class: 'lm-status' });
    const baseIn = this._t('input', null, { placeholder: 'baseUrl', title: 'URL base do servidor' });
    baseIn.value = cfg.baseUrl;
    baseIn.addEventListener('change', () => { LmConfig.set({ baseUrl: baseIn.value.trim() || cfg.baseUrl }); this.refreshStatus(); });
    const modelIn = this._t('input', null, { placeholder: 'modelo (vazio = padrão do servidor)' });
    modelIn.value = cfg.model || '';
    modelIn.addEventListener('change', () => LmConfig.set({ model: modelIn.value.trim() }));
    const grid = this._t('div', null, { class: 'lm-grid' });
    const btns = [];
    LmCommands.list().forEach(c => {
      const b = this._btn(c.title, () => this._runCmd(c.id));
      b.title = c.desc;
      grid.appendChild(b);
      btns.push(b);
    });
    const grid2 = this._t('div', null, { class: 'lm-grid' });
    const bFb = this._btn('📝 Feedback ENEM', () => this._runAI('feedback'));
    const bGrade = this._btn('🎯 Estimar nota', () => this._runAI('grade'));
    const bRep = this._btn('📚 Repertório IA', () => this._runAI('rep'));
    const bIns = this._btn('⬇ Inserir no editor', () => {
      const o = this._els.out?.textContent || '';
      if (o && !o.startsWith('Falhou') && o !== '⏳ Consultando o LM Studio…') {
        try { EditorCore.insert(o); this.say('Inserido no editor.'); } catch (e) { this.say('Erro: ' + e.message, true); }
      }
    });
    [bFb, bGrade, bRep, bIns].forEach(b => { grid2.appendChild(b); btns.push(b); });
    const out = this._t('pre', 'Abra o painel e rode um comando. O texto vem do editor.');
    body.appendChild(status);
    body.appendChild(baseIn);
    body.appendChild(modelIn);
    body.appendChild(grid);
    body.appendChild(grid2);
    body.appendChild(out);
    root.appendChild(st);
    root.appendChild(head);
    root.appendChild(body);
    document.body.appendChild(root);
    this._root = root;
    this._els = { status, out, btns };
    // arrastar pelo cabeçalho
    try {
      let sx = 0, sy = 0, rx = 0, by = 0, drag = false;
      head.addEventListener('mousedown', e => {
        drag = true;
        const r = root.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; rx = r.left; by = r.top;
        root.style.left = rx + 'px'; root.style.right = 'auto'; root.style.bottom = 'auto'; root.style.top = by + 'px';
      });
      document.addEventListener('mousemove', e => {
        if (!drag) return;
        root.style.left = (rx + e.clientX - sx) + 'px';
        root.style.top = (by + e.clientY - sy) + 'px';
      }, true);
      document.addEventListener('mouseup', () => { drag = false; }, true);
    } catch {}
    this.refreshStatus();
    return { ok: true };
  }
};

ModuleRegistry.register('LmPanel', LmPanel, { kind: 'lm-ui' });

/* ── LM-08 · Ponte final: atalhos + namespaces globais + evento de prontidão ──
   Ordem: último da pasta extensions. Runtime (10-runtime) preserva window.RedacaoStudio
   via Object.assign, então as chaves abaixo sobrevivem; window.LMStudio é exclusivo. */

const LmBridge = {
  version: '1.0.0',
  api() {
    return {
      version: this.version,
      config: LmConfig, client: LmClient, cache: LmCache, log: LmLog,
      commands: LmCommands, run: (id, t, o) => LmRunner.run(id, t, o),
      ai: RedacaoAI, panel: LmPanel,
      writing: { Paraphraser, ConnectorSuggester, CohesionHelper, IntroBuilder, ConclusionBuilder, VocabularyCoach },
      productivity: { GoalWizard, StreakBoard, SessionNotes, WordMilestones, DailyBrief, ExportBundle },
      content: { QuoteBank, DataBank, ArgumentBank, CounterArgs, Atualidades },
      devtools: { ExtDiagnostics, ExtLogs, ModuleExplorer, ShortcutDocs }
    };
  },
  install() {
    try { ShortcutManager.install(); } catch {}
    const tries = [
      ['ctrl+shift+l', () => LmPanel.toggle(), 'Painel LM'],
      ['ctrl+shift+m', async () => {
        const r = await LmRunner.run('melhorar', undefined, {});
        try { Logger.info(r.ok ? 'LM: texto melhorado (ver painel/log).' : 'LM falhou: ' + (r.err || '?')); } catch {}
      }, 'Melhorar com IA'],
      ['ctrl+shift+g', async () => {
        const r = await LmRunner.run('gramatica', undefined, {});
        try { Logger.info(r.ok ? 'LM: correção pronta (ver painel/log).' : 'LM falhou: ' + (r.err || '?')); } catch {}
      }, 'Gramática com IA']
    ];
    for (const [combo, fn, label] of tries) {
      try { ShortcutManager.register(combo, fn, { label }); } catch {}
    }
    try {
      const api = this.api();
      window.LMStudio = api;
      window.RedacaoStudio = Object.assign({}, window.RedacaoStudio || {}, {
        lm: api,
        lmPanel: () => LmPanel.toggle(),
        lmRun: api.run,
        lmDiag: () => ExtDiagnostics.checkAll()
      });
    } catch {}
    try { EventBus.emit('lm:ready', { version: this.version, modules: ModuleRegistry.list().length }); } catch {}
    try { Logger.info(`🤖 LM extensions prontas (${ModuleRegistry.list().length} módulos).`); } catch {}
    return { ok: true };
  }
};

ModuleRegistry.register('LmBridge', LmBridge, { kind: 'lm' });

try { LmBridge.install(); } catch {}

/* ── LM-09 · Tela cheia + tecla H oculta o menu (refino da interface) ──
   Age sobre o painel principal (.rs-app) via shadowRoot; não edita a UI legada.
   H só alterna o menu quando o foco NÃO está em campo de digitação
   (ShortcutManager ignora inputs/textareas/contenteditable por padrão). */

const FullscreenUI = {
  STYLE_ID: 'rs-fullscreen-style',
  css() {
    return [
      '.rs-app{transition:width .25s ease,height .25s ease,left .25s ease,top .25s ease}',
      '.rs-app.rs-full{left:0!important;top:0!important;width:100vw!important;max-width:100vw!important;',
      'height:100vh!important;max-height:100vh!important;height:100dvh!important;max-height:100dvh!important;',
      'border-radius:0!important;box-shadow:none!important}',
      '.rs-app.rs-full .rs-body{padding:14px 16px}',
      '.rs-app.rs-full textarea.rs-editor{min-height:38vh;font-size:13.5px}',
      '.rs-app.rs-nomenu .rs-tabs{display:none!important}'
    ].join('\n');
  },
  _root() {
    try {
      if (typeof UI !== 'undefined' && UI.root) return UI.root;
      const host = document.getElementById('rs-unified-host');
      return (host && host.shadowRoot) || null;
    } catch { return null; }
  },
  _app() {
    const r = this._root();
    try { return (r && r.querySelector('.rs-app')) || null; } catch { return null; }
  },
  ensureStyle() {
    try {
      const r = this._root();
      if (!r) return false;
      if (r.getElementById && r.getElementById(this.STYLE_ID)) return true;
      const st = document.createElement('style');
      st.setAttribute('id', this.STYLE_ID);
      st.textContent = this.css();
      r.appendChild(st);
      this._applySaved();
      return true;
    } catch { return false; }
  },
  _flags() {
    try {
      RsStoreExt.ensure();
      Store.data.ui = Store.data.ui || {};
      return Store.data.ui;
    } catch { return {}; }
  },
  _applySaved() {
    const f = this._flags();
    if (f.full) this.setFull(true, true);
    if (f.nomenu) this.setMenuHidden(true, true);
  },
  isFull() { const a = this._app(); return !!a && a.classList.contains('rs-full'); },
  setFull(v, silent = false) {
    const a = this._app();
    if (!a && !silent) return { ok: false, err: 'panel_not_mounted' };
    if (a) a.classList.toggle('rs-full', !!v);
    try { this._flags().full = !!v; Store.save(); } catch {}
    if (!silent) { try { EventBus.emit('ui:fullscreen', { full: !!v }); } catch {} }
    return { ok: true, full: !!v };
  },
  toggleFull() {
    this.ensureStyle();
    return this.setFull(!this.isFull());
  },
  isMenuHidden() { const a = this._app(); return !!a && a.classList.contains('rs-nomenu'); },
  setMenuHidden(v, silent = false) {
    const a = this._app();
    if (!a && !silent) return { ok: false, err: 'panel_not_mounted' };
    if (a) a.classList.toggle('rs-nomenu', !!v);
    try { this._flags().nomenu = !!v; Store.save(); } catch {}
    if (!silent) { try { EventBus.emit('ui:menu', { hidden: !!v }); } catch {} }
    return { ok: true, hidden: !!v };
  },
  toggleMenu() {
    this.ensureStyle();
    const a = this._app();
    if (!a) return { ok: false, err: 'panel_not_mounted' };
    return this.setMenuHidden(!this.isMenuHidden());
  },
  install() {
    if (typeof window !== 'undefined' && window.__rsFullscreenInstalled) { this.ensureStyle(); return { ok: true }; }
    try {
      ShortcutManager.install();
      ShortcutManager.register('h', () => this.toggleMenu(), { label: 'Ocultar/mostrar menu (H)' });
      ShortcutManager.register('f', () => this.toggleFull(), { label: 'Tela cheia (F)' });
    } catch {}
    const watch = () => {
      if (this.ensureStyle()) return true;
      return false;
    };
    try {
      if (!watch() && typeof MutationObserver !== 'undefined') {
        const ob = new MutationObserver(() => { if (watch()) ob.disconnect(); });
        ob.observe(document.documentElement || document.body, { childList: true, subtree: true });
        setTimeout(() => { try { ob.disconnect(); } catch {} watch(); }, 15000);
      }
    } catch {}
    try {
      [400, 1500, 4000].forEach(ms => setTimeout(() => this.ensureStyle(), ms));
    } catch {}
    try {
      if (typeof window !== 'undefined') {
        window.__rsFullscreenInstalled = true;
        window.LMStudio = window.LMStudio || {};
        window.LMStudio.ui = this;
        window.RedacaoStudio = Object.assign({}, window.RedacaoStudio || {}, {
          fullscreen: (v) => (v === undefined ? this.toggleFull() : this.setFull(v)),
          toggleMenu: () => this.toggleMenu()
        });
      }
    } catch {}
    return { ok: true };
  }
};

ModuleRegistry.register('FullscreenUI', FullscreenUI, { kind: 'lm-ui' });

try { FullscreenUI.install(); } catch {}

/* ── 25. TOASTS ────────────────────────────────────────────── */
const Toast = {
  show(msg, type = 'info', ms = 2800) {
    const c = UI.root?.querySelector('.rs-toasts'); if (!c) return console.log('[Studio]', msg);
    const t = document.createElement('div');
    t.className = `rs-toast rs-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('rs-on'));
    setTimeout(() => { t.classList.remove('rs-on'); setTimeout(() => t.remove(), 300); }, ms);
  },
  ok(m) { this.show(m, 'ok'); },
  err(m) { this.show(m, 'err', 3800); },
  info(m) { this.show(m, 'info'); }
};

/* ── 26. INIT ─────────────────────────────────────────────── */
Store.load();
URLCapture.install();
Spy.install();
UI.mount();
VessieStudio.mount();
VessieDesktop.mount();
UI._updateFinishBtn();

/* Public APIs */
window.MatificPanel = {
  version: '6.0.0',
  action: (name, ...args) => UI.action(name, null, args),
  bridge: IframeBridge, spy: Spy, logger: Logger, ui: UI,
  scanner: EpisodeScanner, games: GameTools, gameMode: GameMode, auto: AutoCompleter, unlocker: LevelUnlocker,
  spawn: SpawnFinish, capture: URLCapture, quill: QuillBridge,
  utils: Utils, store: Store,
  __cleanup: () => UI.destroy()
};
window.VessieDesktop = VessieDesktop.api();

window.RedacaoStudio = Object.assign({
  insert: (txt, mode) => {
    if (txt !== undefined) UI.setText(txt);
    if (mode) { const m = UI.$('.rs-mode'); if (m) m.value = mode; }
    UI.insertNow();
  },
  open: () => UI.setMin(false),
  close: () => UI.destroy(),
  getText: () => UI.$('.rs-editor').value,
  setText: t => UI.setText(t),
  proposal: () => UI.proposal,
  stats: () => Analyzer.stats(UI.$('.rs-editor').value),
  focus: () => Focus.toggle(),
  snapshot: () => Snap.force(),
  drafts: () => Store.data.drafts,
  history: () => Store.data.history,
  sessions: () => Store.data.sessions,
  Vessie: VessieStudio.api()
}, window.RedacaoStudio || {});
window.MatificPanel.rs = Object.assign({}, window.MatificPanel.rs || {}, RsExtensions.api());
window.MatificPanel.modules = window.MatificPanel.modules || (() => ModuleRegistry.list());

window.__rsInstance = window.MatificPanel;

/* Init async */
setTimeout(() => {
  const s = IframeBridge.scan();
  Logger.info(`🔎 Unity=${s.unityInstance} Canais=${s.channels.length} Iframes=${s.iframes.length}`);
  URLCapture.scanPerformance();
  UI._refreshSpawnUI();
  UI._updateStatus();
}, 1000);

console.log(
  '%c[Studio Ultimate] v6.0%c — Matific + Redação unificados',
  'color:#7c5cff;font-weight:bold;font-size:14px',
  'color:#888'
);
console.log('%cAtalhos:', 'color:#7c5cff;font-weight:bold', {
  'Listar jogos': 'MatificPanel.games.list()',
  'Buscar jogo': 'MatificPanel.games.list("termo")',
  'Abrir jogo': 'MatificPanel.games.open(0)',
  'Modo VessieOS': 'MatificPanel.gameMode.open()',
  'Spawn custom': 'MatificPanel.spawn.spawnCustom("SlugName", { stars: 5, score: 2500 })',
  'Spawn all':    'MatificPanel.action("spawn-all-finish")',
  'Test endpoint':'MatificPanel.action("spawn-test")',
  'Redação insert':'RedacaoStudio.insert("texto")',
  'Redação stats': 'RedacaoStudio.stats()',
  'Focus toggle':  'RedacaoStudio.focus()',
  'Snapshot':      'RedacaoStudio.snapshot()',
  'Fechar':        'RedacaoStudio.close()'
});
})();
