/* Слой хранения.
 *
 * Решения, принятые после технической критики:
 *
 *  1. Один цельный документ вместо россыпи ключей. 47 КБ разбираются
 *     примерно за миллисекунду, зато атомарная запись убивает целый класс
 *     багов рассогласования между «начислили XP» и «записали ответ».
 *  2. Семидневное удаление в iOS Safari накрывает ВСЁ скриптовое хранилище
 *     сразу: localStorage, IndexedDB, Cache API. Зеркало в IndexedDB не
 *     является защитой от него. Защищает только установка на домашний
 *     экран, у неё отдельный счётчик неактивности. Снимки в IndexedDB
 *     защищают от другого — от битой записи и от ошибки миграции.
 *  3. Приватный режим не определяем. Просто пробуем писать и обрабатываем
 *     отказ: любая эвристика определения устаревает быстрее, чем пишется.
 *  4. Две вкладки разводятся монотонным номером ревизии и широковещательным
 *     каналом. Без этого вкладка Б перезаписывает работу вкладки А молча.
 *  5. Документ из более новой версии приложения не трогаем вообще:
 *     переходим в режим только для чтения. Откат версии не должен
 *     уничтожать прогресс.
 */

import { today } from './day.js';

const K_VERSION = 'shodu:v';
const K_STATE = 'shodu:state';
const K_BACKUP = 'shodu:backup';
const CODE_VERSION = 1;

const WRITE_DEBOUNCE_MS = 400;
const IDB_NAME = 'shodu';
const IDB_STORE = 'snapshots';
const IDB_KEEP = 3;

/* ── начальное состояние ───────────────────────────────────────── */

export function emptyState() {
  return {
    v: CODE_VERSION,
    rev: 0,
    createdDay: today(),
    profile: { name: '', avatar: { base: 'b00', hat: 'h00', frame: 'f00' }, level: 1, xp: 0 },
    owned: [],                  // купленные предметы лавки
    questsClaimed: {},          // { [день]: [id челленджей] }
    settings: {
      theme: 'auto',            // auto | light | dark
      motion: 'full',           // full | calm | off
      sound: true, volume: 0.9,
      speech: true, speechRate: 0.95,
      haptics: true,
      fontScale: 'm',
      lang: null,               // null = взять из браузера
      dailyGoalWords: 10,
      reminderTime: null,       // 'HH:MM' — только для файла календаря
      autoChallenge: true,
      accent: 'a00',
      wordSet: null,            // null = вся база
    },
    econ: { gems: 0, xpTotal: 0 },
    streak: { current: 0, best: 0, lastDay: null, freezes: 0, pausedDays: 0 },
    lives: { count: 2, max: 2, lostAt: null, shieldUntil: null },
    challenge: {
      index: 8, manual: false, manualUntil: null,
      size: 18, sizeManual: false, sizeManualUntil: null,
      lastChangeDay: null, changedToday: 0, votes: [],
    },
    day: today(),
    // Состояние слов по идентификатору. В компактный экспорт
    // раскладывается плоскими массивами в порядке data/words.json —
    // этот порядок уже зафиксирован и является частью формата.
    srs: { deck1: {}, deck2: {} },
    days: {},                   // { [номер дня]: { ms, xp, words, sessions, correct, answered } }
    dailyQuests: { day: null, list: [] },
    referral: {
      selfCode: null,           // выдаётся при первом запуске
      invitedBy: null,          // код пригласившего, если пришли по ссылке
      newcomerPaid: false,      // бонус новичку выдан после первого занятия
      friends: [],              // подтверждённые коды друзей
    },
    premium: { active: false, since: null },  // «Сходу Всё»: даётся за троих друзей
    medals: {},                 // { [id]: номер дня получения }
    rulesRead: {},              // { [id правила]: номер дня }
    baseline: null,             // первая проверка: точка отсчёта роста
    keys: {},                   // открытые «ключи» соответствий, -tion → -ция
    flags: { onboarded: false, installPromptSeen: false, deck2Unlocked: false },
  };
}

/* ── миграции ──────────────────────────────────────────────────── */

const MIGRATIONS = {
  // 1: (s) => { ...; s.v = 2; return s; }
};

function migrate(state) {
  let s = state;
  while (s.v < CODE_VERSION) {
    const step = MIGRATIONS[s.v];
    if (!step) { s.v = CODE_VERSION; break; }
    s = step(s);
  }
  return s;
}

/* ── IndexedDB: снимки на случай битой записи ──────────────────── */

function idbOpen() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    let req;
    try { req = indexedDB.open(IDB_NAME, 1); } catch { return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'rev' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbPutSnapshot(state) {
  const db = await idbOpen();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const st = tx.objectStore(IDB_STORE);
    st.put({ rev: state.rev, at: Date.now(), json: JSON.stringify(state) });
    st.getAllKeys().onsuccess = (e) => {
      const keys = e.target.result || [];
      keys.sort((a, b) => a - b);
      for (const k of keys.slice(0, Math.max(0, keys.length - IDB_KEEP))) st.delete(k);
    };
  } catch { /* снимок не критичен */ }
}

export async function idbLatestSnapshot() {
  const db = await idbOpen();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const st = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE);
      const req = st.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        if (!all.length) return resolve(null);
        all.sort((a, b) => b.rev - a.rev);
        try { resolve(JSON.parse(all[0].json)); } catch { resolve(null); }
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/* ── само хранилище ────────────────────────────────────────────── */

class Storage extends EventTarget {
  constructor() {
    super();
    this.state = null;
    this.readOnly = false;      // документ из более новой версии приложения
    this.memoryOnly = false;    // писать некуда: приватный режим или квота
    this._timer = null;
    this._chan = null;
    this._lastWrittenRev = -1;
  }

  load() {
    let raw = null;
    try { raw = localStorage.getItem(K_STATE); }
    catch { this.memoryOnly = true; }

    let parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); }
      catch {
        // Битый документ: пробуем резервную копию, она пишется через раз.
        try { parsed = JSON.parse(localStorage.getItem(K_BACKUP) || 'null'); }
        catch { parsed = null; }
        this._emit('corrupt');
      }
    }

    if (parsed && typeof parsed === 'object') {
      if (parsed.v > CODE_VERSION) {
        // Приложение откатили. Чужой документ не трогаем.
        this.readOnly = true;
        this.state = parsed;
        this._emit('readonly');
      } else {
        this.state = migrate(parsed);
      }
    } else {
      this.state = emptyState();
    }

    this._initChannel();
    this._initFlushHooks();
    return this.state;
  }

  _initChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this._chan = new BroadcastChannel('shodu');
      this._chan.onmessage = (e) => {
        const msg = e.data;
        if (!msg || msg.type !== 'rev' || this.readOnly) return;
        // Другая вкладка ушла вперёд. Забираем её версию, свою не пишем.
        if (msg.rev > this.state.rev) {
          try {
            const fresh = JSON.parse(localStorage.getItem(K_STATE) || 'null');
            if (fresh && fresh.rev > this.state.rev) {
              this.state = fresh;
              this._emit('external');
            }
          } catch { /* пусть останется своё */ }
        }
      };
    } catch { /* канал не обязателен */ }
  }

  _initFlushHooks() {
    const flush = () => this.flush();
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Отметить состояние изменённым. Запись отложенная. */
  touch() {
    if (this.readOnly) return;
    this.state.rev++;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), WRITE_DEBOUNCE_MS);
  }

  /** Немедленная запись. Вызывается перед уходом страницы и перед перезагрузкой. */
  flush() {
    clearTimeout(this._timer);
    if (this.readOnly || !this.state) return false;
    if (this.state.rev === this._lastWrittenRev) return true;

    const json = JSON.stringify(this.state);
    try {
      // Резервная копия пишется предыдущим значением: если основная запись
      // оборвётся, откатываться будет куда.
      const prev = localStorage.getItem(K_STATE);
      if (prev) localStorage.setItem(K_BACKUP, prev);
      localStorage.setItem(K_STATE, json);
      localStorage.setItem(K_VERSION, String(CODE_VERSION));
      this._lastWrittenRev = this.state.rev;
      this.memoryOnly = false;
      if (this._chan) { try { this._chan.postMessage({ type: 'rev', rev: this.state.rev }); } catch {} }
      if (this.state.rev % 10 === 0) idbPutSnapshot(this.state);
      return true;
    } catch (err) {
      return this._handleWriteFailure(err, json);
    }
  }

  _handleWriteFailure(err, json) {
    const quota = err && (err.name === 'QuotaExceededError'
      || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
    if (quota && this._pruneDays()) {
      try {
        localStorage.setItem(K_STATE, JSON.stringify(this.state));
        return true;
      } catch { /* провалились ниже */ }
    }
    // Писать некуда. Работаем из памяти и честно говорим об этом.
    this.memoryOnly = true;
    this._emit('nostorage', { quota, bytes: json.length });
    idbPutSnapshot(this.state);
    return false;
  }

  /** Прунинг истории: самое старое уходит первым, последние 400 дней остаются. */
  _pruneDays() {
    const keys = Object.keys(this.state.days).map(Number).sort((a, b) => a - b);
    if (keys.length <= 400) return false;
    for (const k of keys.slice(0, keys.length - 400)) delete this.state.days[k];
    try { localStorage.removeItem(K_BACKUP); } catch {}
    return true;
  }

  /** Полное удаление. Вызывается только из «опасной зоны» настроек. */
  wipe() {
    try {
      localStorage.removeItem(K_STATE);
      localStorage.removeItem(K_BACKUP);
      localStorage.removeItem(K_VERSION);
    } catch {}
    this.state = emptyState();
    this._lastWrittenRev = -1;
    this.flush();
  }
}

export const storage = new Storage();
