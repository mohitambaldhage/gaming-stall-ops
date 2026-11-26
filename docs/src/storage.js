import { computeMetrics, DEFAULT_RATE_PER_SLOT, DEFAULT_SLOT_MINUTES } from './domain.js';

const SYNC_CONFIG_KEY = 'stall_sync_config_v1';
const LOCAL_STATE_KEY = 'stall_local_state_v1';
const PIN_STORAGE_KEY = 'stall_operator_pin_v1';
const IDB_NAME = 'gaming-stall-ops-db';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'current';

export const FALLBACK_SEED = {
  settings: {
    stallName: 'Nov 28 Gaming Stall',
    eventDate: '2026-11-28',
    openTime: '11:00',
    ratePerSlot: DEFAULT_RATE_PER_SLOT,
    slotMinutes: DEFAULT_SLOT_MINUTES,
    noPauseRule: true,
    currencySymbol: '₹',
  },
  laptops: [
    {
      id: 'l1-mohit',
      code: 'L1',
      owner: 'Mohit',
      ownership: 'Mine',
      specs: 'HP Omen · RTX 5070 · Ryzen 9 8940HX · 24 GB RAM',
      notes: 'Host rig (also in rotation)',
      active: true,
      sortOrder: 1,
      games: [
        { id: 'l1-gta5', title: 'GTA 5', installed: true },
        { id: 'l1-fh6', title: 'Forza Horizon 6', installed: true },
        { id: 'l1-roblox', title: 'Roblox', installed: true },
        { id: 'l1-minecraft', title: 'Minecraft', installed: true },
        { id: 'l1-genshin', title: 'Genshin Impact', installed: true },
        { id: 'l1-cp2077', title: 'Cyberpunk 2077', installed: true },
        { id: 'l1-valorant', title: 'Valorant', installed: true },
        { id: 'l1-sm2', title: "Marvel's Spider-Man 2", installed: false, note: 'To install' },
      ],
    },
    {
      id: 'l2-rohan',
      code: 'L2',
      owner: 'Rohan',
      ownership: 'Friend',
      specs: 'HP Omen · RTX 5070 · Intel Core Ultra 7 255H · 24 GB RAM',
      notes: 'Heavy AAA + Souls + Silksong rig',
      active: true,
      sortOrder: 2,
      games: [
        { id: 'l2-minecraft', title: 'Minecraft', installed: true },
        { id: 'l2-gow', title: 'God of War', installed: true },
        { id: 'l2-fh6', title: 'Forza Horizon 6', installed: true },
        { id: 'l2-dsr', title: 'Dark Souls Remastered', installed: true },
        { id: 'l2-silksong', title: 'Hollow Knight: Silksong', installed: true },
        { id: 'l2-hk', title: 'Hollow Knight', installed: true },
        { id: 'l2-roblox', title: 'Roblox', installed: true },
        { id: 'l2-wukong', title: 'Black Myth: Wukong', installed: true },
        { id: 'l2-valorant', title: 'Valorant', installed: true },
      ],
    },
    {
      id: 'l3-varun',
      code: 'L3',
      owner: 'Varun',
      ownership: 'Friend',
      specs: 'Lenovo Legion 5 · RTX 5060 · AMD Ryzen 7 260 · 16 GB RAM · 1 TB',
      notes: '',
      active: true,
      sortOrder: 3,
      games: [
        { id: 'l3-acbf', title: "Assassin's Creed Black Flag Resynced", installed: true },
        { id: 'l3-gowr', title: 'God of War Ragnarök', installed: true },
        { id: 'l3-gta5', title: 'GTA 5', installed: true },
        { id: 'l3-fh6', title: 'Forza Horizon 6', installed: true },
        { id: 'l3-minecraft', title: 'Minecraft', installed: true },
      ],
    },
    {
      id: 'l4-shubodeep',
      code: 'L4',
      owner: 'Shubodeep',
      ownership: 'Friend',
      specs: 'Lenovo LOQ · RTX 5060',
      notes: '',
      active: true,
      sortOrder: 4,
      games: [
        { id: 'l4-fh6', title: 'Forza Horizon 6', installed: true },
        { id: 'l4-gta5', title: 'GTA 5', installed: true },
        { id: 'l4-asphalt8', title: 'Asphalt 8 Legends', installed: true },
        { id: 'l4-rdr2', title: 'Red Dead Redemption 2', installed: true },
      ],
    },
    {
      id: 'l5-himank',
      code: 'L5',
      owner: 'Himank',
      ownership: 'Friend',
      specs: 'RTX 4050 · General Gaming',
      notes: 'Can run most games',
      active: true,
      sortOrder: 5,
      games: [
        { id: 'l5-valorant', title: 'Valorant', installed: true },
        { id: 'l5-minecraft', title: 'Minecraft', installed: true },
        { id: 'l5-roblox', title: 'Roblox', installed: true },
        { id: 'l5-gta5', title: 'GTA 5', installed: true },
        { id: 'l5-fh5', title: 'Forza Horizon 5', installed: true },
        { id: 'l5-got', title: 'Ghost of Tsushima', installed: true },
        { id: 'l5-wukong', title: 'Black Myth: Wukong', installed: true },
        { id: 'l5-smr', title: 'Spider-Man Remastered', installed: true },
        { id: 'l5-smmm', title: 'Spider-Man: Miles Morales', installed: true },
      ],
    },
    {
      id: 'l6-faru',
      code: 'L6',
      owner: 'Faru',
      ownership: 'Friend',
      specs: 'ROG Strix · RTX 5050 · Intel Core i7 · 16 GB RAM',
      notes: '',
      active: true,
      sortOrder: 6,
      games: [
        { id: 'l6-minecraft', title: 'Minecraft', installed: true },
        { id: 'l6-roblox', title: 'Roblox', installed: true },
      ],
    },
    {
      id: 'l7-aravind',
      code: 'L7',
      owner: 'Aravind',
      ownership: 'Friend',
      specs: 'RTX 3050 (6 GB) · Intel Core i7 · 16 GB RAM',
      notes: '',
      active: true,
      sortOrder: 7,
      games: [
        { id: 'l7-gta5', title: 'GTA 5', installed: false, note: 'Yet to install' },
        { id: 'l7-minecraft', title: 'Minecraft', installed: true },
        { id: 'l7-roblox', title: 'Roblox', installed: true },
        { id: 'l7-valorant', title: 'Valorant', installed: true },
      ],
    },
  ],
};

function shortId(prefix) {
  const rand = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .toSorted((a, b) => Number(a) - Number(b))
      .map((k) => value[k])
      .filter((item) => item != null);
  }
  return [];
}

export function normalizeFirebaseUrl(raw) {
  let clean = String(raw || '').trim().replace(/\/+$/, '');
  clean = clean.replace(/\/stall_state\.json$/i, '').replace(/\/\.json$/i, '').replace(/\/+$/, '');
  return clean;
}

export function normalizeSnapshot(raw, fallbackMeta = null) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const settings = {
    ...FALLBACK_SEED.settings,
    ...(src.settings && typeof src.settings === 'object' ? src.settings : {}),
    noPauseRule: true,
    currencySymbol: '₹',
  };

  const laptops = toArray(src.laptops).map((rig, idx) => ({
    id: rig.id || shortId(`l${idx + 1}`),
    code: String(rig.code || `L${idx + 1}`).trim(),
    owner: String(rig.owner || `Laptop ${idx + 1}`).trim(),
    ownership: String(rig.ownership || 'Friend').trim() || 'Friend',
    specs: String(rig.specs || '').trim(),
    notes: String(rig.notes || '').trim(),
    active: rig.active !== false,
    sortOrder: Number(rig.sortOrder || idx + 1),
    games: toArray(rig.games)
      .map((g) => ({
        id: g.id || shortId('g'),
        title: String(typeof g === 'string' ? g : g.title || '').trim(),
        installed: g.installed !== false,
        note: String(g.note || '').trim(),
      }))
      .filter((g) => g.title),
  }));

  const sessions = toArray(src.sessions).map((s) => ({
    ...s,
    blocksCount: Number(s.blocksCount || 1),
    ratePerSlot: Number(s.ratePerSlot || settings.ratePerSlot || 149),
    slotMinutes: Number(s.slotMinutes || settings.slotMinutes || 30),
  }));

  const payments = toArray(src.payments).map((p) => ({
    ...p,
    method: p.method === 'upi' ? 'upi' : 'cash',
    amount: Number(p.amount || 0),
    slots: Number(p.slots || 1),
    paperChecked: Boolean(p.paperChecked),
    voidedAt: p.voidedAt ?? null,
  }));

  const now = Date.now();
  return {
    version: Number(src.version || 1),
    serverNow: Number(src.serverNow || now),
    updatedAt: Number(src.updatedAt || now),
    settings,
    laptops,
    sessions,
    payments,
    metrics: computeMetrics(sessions, payments, settings),
    ...(fallbackMeta ? { meta: fallbackMeta } : src.meta ? { meta: src.meta } : {}),
  };
}

function makeFreshLocalState(seed = FALLBACK_SEED) {
  return normalizeSnapshot(
    {
      version: 1,
      serverNow: Date.now(),
      updatedAt: Date.now(),
      settings: structuredClone(seed.settings),
      laptops: structuredClone(seed.laptops),
      sessions: [],
      payments: [],
    },
    { mode: 'local', networkUrls: [location.origin] },
  );
}

function openIdb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readIdbSnapshot() {
  try {
    const db = await openIdb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeIdbSnapshot(snapshot) {
  try {
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota failure
  }
  try {
    const db = await openIdb();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(snapshot, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Fallback already written to localStorage
  }
}

async function readLocalFallbackSnapshot() {
  const fromIdb = await readIdbSnapshot();
  if (fromIdb && (Array.isArray(fromIdb.laptops) || (fromIdb.laptops && typeof fromIdb.laptops === 'object'))) {
    return normalizeSnapshot(fromIdb, { mode: 'local', networkUrls: [location.origin] });
  }
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.laptops) {
        return normalizeSnapshot(parsed, { mode: 'local', networkUrls: [location.origin] });
      }
    }
  } catch {
    // Ignore parse error
  }
  try {
    const res = await fetch('./seed.json', { cache: 'no-store' });
    if (res.ok) {
      const seed = await res.json();
      if (seed && Array.isArray(seed.laptops)) {
        const fresh = makeFreshLocalState(seed);
        await writeIdbSnapshot(fresh);
        return fresh;
      }
    }
  } catch {
    // Ignore fetch error offline
  }
  const fresh = makeFreshLocalState(FALLBACK_SEED);
  await writeIdbSnapshot(fresh);
  return fresh;
}

export function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return { mode: 'auto', serverUrl: '', firebaseUrl: '' };
    const parsed = JSON.parse(raw);
    return {
      mode: ['auto', 'server', 'firebase', 'local'].includes(parsed?.mode) ? parsed.mode : 'auto',
      serverUrl: String(parsed?.serverUrl || '').trim().replace(/\/+$/, ''),
      firebaseUrl: normalizeFirebaseUrl(parsed?.firebaseUrl || ''),
    };
  } catch {
    return { mode: 'auto', serverUrl: '', firebaseUrl: '' };
  }
}

export function saveSyncConfig(next) {
  const clean = {
    mode: ['auto', 'server', 'firebase', 'local'].includes(next?.mode) ? next.mode : 'auto',
    serverUrl: String(next?.serverUrl || '').trim().replace(/\/+$/, ''),
    firebaseUrl: normalizeFirebaseUrl(next?.firebaseUrl || ''),
  };
  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(clean));
  } catch {
    // Ignore
  }
  return clean;
}

export function getSavedPin() {
  try {
    return localStorage.getItem(PIN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function savePin(pin) {
  try {
    if (pin) localStorage.setItem(PIN_STORAGE_KEY, String(pin).trim());
    else localStorage.removeItem(PIN_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

function applyLocalMutation(snapshot, op, payload) {
  const next = structuredClone(snapshot);
  const now = Date.now();
  next.settings ||= { ...FALLBACK_SEED.settings };
  next.laptops ||= [];
  next.sessions ||= [];
  next.payments ||= [];

  const rate = Number(next.settings.ratePerSlot || 149);
  const slotMins = Number(next.settings.slotMinutes || 30);

  switch (op) {
    case 'updateSettings': {
      const r = Number(payload?.ratePerSlot ?? rate);
      const m = Number(payload?.slotMinutes ?? slotMins);
      next.settings = {
        ...next.settings,
        stallName: String(payload?.stallName ?? next.settings.stallName).trim() || next.settings.stallName,
        eventDate: String(payload?.eventDate ?? next.settings.eventDate).trim() || next.settings.eventDate,
        openTime: String(payload?.openTime ?? next.settings.openTime).trim() || next.settings.openTime,
        ratePerSlot: Math.max(1, Math.round(Number.isFinite(r) ? r : rate)),
        slotMinutes: Math.max(1, Math.round(Number.isFinite(m) ? m : slotMins)),
        noPauseRule: true,
        currencySymbol: '₹',
      };
      break;
    }
    case 'addLaptop': {
      const owner = String(payload?.owner || '').trim();
      if (!owner) throw new Error('Owner name is required');
      const nextOrder = next.laptops.length
        ? Math.max(...next.laptops.map((l) => Number(l.sortOrder || 0))) + 1
        : 1;
      const seen = new Set();
      const games = [];
      for (const g of Array.isArray(payload?.games) ? payload.games : []) {
        const title = String(typeof g === 'string' ? g : g?.title || '').trim();
        if (!title) continue;
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        games.push({
          id: g?.id || shortId('g'),
          title,
          installed: g?.installed !== false,
          note: String(g?.note || '').trim(),
        });
      }

      next.laptops.push({
        id: shortId(`l${nextOrder}`),
        code: String(payload?.code || '').trim() || `L${nextOrder}`,
        owner,
        ownership: String(payload?.ownership || 'Friend').trim() || 'Friend',
        specs: String(payload?.specs || '').trim(),
        notes: String(payload?.notes || '').trim(),
        active: true,
        sortOrder: nextOrder,
        games,
      });
      break;
    }
    case 'updateLaptop': {
      const rig = next.laptops.find((l) => l.id === payload.id);
      if (!rig) throw new Error('Laptop not found');
      if (payload.code !== undefined) rig.code = String(payload.code).trim() || rig.code;
      if (payload.owner !== undefined) rig.owner = String(payload.owner).trim() || rig.owner;
      if (payload.ownership !== undefined) rig.ownership = String(payload.ownership).trim() || rig.ownership;
      if (payload.specs !== undefined) rig.specs = String(payload.specs).trim();
      if (payload.notes !== undefined) rig.notes = String(payload.notes).trim();
      if (payload.active !== undefined) rig.active = Boolean(payload.active);
      if (Array.isArray(payload.games)) {
        const seen = new Set();
        rig.games = [];
        for (const g of payload.games) {
          const title = String(typeof g === 'string' ? g : g?.title || '').trim();
          if (!title) continue;
          const key = title.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          rig.games.push({
            id: g?.id || shortId('g'),
            title,
            installed: g?.installed !== false,
            note: String(g?.note || '').trim(),
          });
        }
      }
      break;
    }
    case 'addGame': {
      const rig = next.laptops.find((l) => l.id === payload.laptopId);
      if (!rig) throw new Error('Laptop not found');
      const title = String(payload.title || '').trim();
      if (!title) throw new Error('Game title is required');
      if (rig.games.some((g) => g.title.toLowerCase() === title.toLowerCase())) {
        throw new Error('Game already listed on this laptop');
      }
      rig.games.push({
        id: shortId('g'),
        title,
        installed: payload.installed !== false,
        note: String(payload.note || '').trim(),
      });
      break;
    }
    case 'toggleGame': {
      const rig = next.laptops.find((l) => l.id === payload.laptopId);
      if (!rig) throw new Error('Laptop not found');
      const game = rig.games.find((g) => g.id === payload.gameId);
      if (!game) throw new Error('Game not found');
      game.installed = !game.installed;
      if (game.installed && /install/i.test(game.note || '')) game.note = '';
      else if (!game.installed && !game.note) game.note = 'To install';
      break;
    }
    case 'removeGame': {
      const rig = next.laptops.find((l) => l.id === payload.laptopId);
      if (!rig) throw new Error('Laptop not found');
      rig.games = rig.games.filter((g) => g.id !== payload.gameId);
      break;
    }
    case 'startSession': {
      const rig = next.laptops.find((l) => l.id === payload.laptopId);
      if (!rig) throw new Error('Laptop not found');
      if (next.sessions.some((s) => s.laptopId === rig.id && s.status === 'active')) {
        throw new Error(`${rig.code} already has an active session running`);
      }
      const gameTitle = String(payload.gameTitle || '').trim();
      if (!gameTitle) throw new Error('Select or enter a game title');
      const slipNo = next.sessions.reduce((m, s) => Math.max(m, Number(s.slipNo || 0)), 0) + 1;
      const sessionId = shortId('sess');
      const playerName = String(payload.playerName || '').trim() || `Player #${slipNo}`;
      const endsAt = now + slotMins * 60_000;

      next.sessions.unshift({
        id: sessionId,
        slipNo,
        laptopId: rig.id,
        laptopCode: rig.code,
        laptopOwner: rig.owner,
        playerName,
        gameTitle,
        startedAt: now,
        endsAt,
        endedAt: null,
        status: 'active',
        blocksCount: 1,
        ratePerSlot: rate,
        slotMinutes: slotMins,
        notes: String(payload.notes || '').trim(),
        createdAt: now,
        updatedAt: now,
      });

      if (payload.paymentMethod === 'cash' || payload.paymentMethod === 'upi') {
        const receiptNo = next.payments.reduce((m, p) => Math.max(m, Number(p.receiptNo || 0)), 0) + 1;
        next.payments.unshift({
          id: shortId('pay'),
          receiptNo,
          method: payload.paymentMethod,
          amount: rate,
          slots: 1,
          sessionId,
          laptopId: rig.id,
          laptopCode: rig.code,
          playerName,
          note: `${gameTitle} (Slip #${slipNo})`,
          paperChecked: false,
          createdAt: now,
          voidedAt: null,
        });
      }
      break;
    }
    case 'extendSession': {
      const session = next.sessions.find((s) => s.id === payload.sessionId);
      if (!session) throw new Error('Session not found');
      if (session.status !== 'active') throw new Error('Only active sessions can be extended');
      const addBlocks = Math.max(1, Math.min(6, Math.round(Number(payload.blocks || 1))));
      const addMs = addBlocks * Number(session.slotMinutes || slotMins) * 60_000;
      const base =
        now - session.endsAt < Number(session.slotMinutes || slotMins) * 60_000
          ? session.endsAt
          : now;
      session.blocksCount += addBlocks;
      session.endsAt = base + addMs;
      session.updatedAt = now;

      if (payload.paymentMethod === 'cash' || payload.paymentMethod === 'upi') {
        const receiptNo = next.payments.reduce((m, p) => Math.max(m, Number(p.receiptNo || 0)), 0) + 1;
        next.payments.unshift({
          id: shortId('pay'),
          receiptNo,
          method: payload.paymentMethod,
          amount: addBlocks * Number(session.ratePerSlot || rate),
          slots: addBlocks,
          sessionId: session.id,
          laptopId: session.laptopId,
          laptopCode: session.laptopCode,
          playerName: session.playerName,
          note: `+${addBlocks * Number(session.slotMinutes || slotMins)}m ext (${session.gameTitle})`,
          paperChecked: false,
          createdAt: now,
          voidedAt: null,
        });
      }
      break;
    }
    case 'endSession': {
      const session = next.sessions.find((s) => s.id === payload.sessionId);
      if (!session) throw new Error('Session not found');
      if (session.status !== 'active') throw new Error('Session is already closed');
      session.status = payload.cancel ? 'cancelled' : 'completed';
      session.endedAt = now;
      session.updatedAt = now;
      break;
    }
    case 'recordPayment': {
      const slots = Math.max(1, Math.min(20, Math.round(Number(payload.slots || 1))));
      const method = payload.method === 'upi' ? 'upi' : 'cash';
      const amount = payload.amount ? Math.round(Number(payload.amount)) : slots * rate;
      const rig = payload.laptopId ? next.laptops.find((l) => l.id === payload.laptopId) : null;
      const receiptNo = next.payments.reduce((m, p) => Math.max(m, Number(p.receiptNo || 0)), 0) + 1;

      next.payments.unshift({
        id: shortId('pay'),
        receiptNo,
        method,
        amount,
        slots,
        sessionId: payload.sessionId || null,
        laptopId: rig?.id || null,
        laptopCode: rig?.code || null,
        playerName: String(payload.playerName || '').trim(),
        note: String(payload.note || '').trim(),
        paperChecked: false,
        createdAt: now,
        voidedAt: null,
      });
      break;
    }
    case 'togglePaperChecked': {
      const pay = next.payments.find((p) => p.id === payload.paymentId);
      if (!pay) throw new Error('Payment not found');
      pay.paperChecked = !pay.paperChecked;
      break;
    }
    case 'voidPayment': {
      const pay = next.payments.find((p) => p.id === payload.paymentId);
      if (!pay) throw new Error('Payment not found');
      if (pay.voidedAt) throw new Error('Payment already voided');
      pay.voidedAt = now;
      break;
    }
    case 'resetDay': {
      next.sessions = [];
      next.payments = [];
      break;
    }
    case 'importSnapshot': {
      if (!payload || !Array.isArray(payload.laptops)) {
        throw new Error('Invalid backup JSON');
      }
      return normalizeSnapshot(payload, next.meta || null);
    }
    default:
      throw new Error(`Unknown operation: ${op}`);
  }

  next.serverNow = now;
  next.updatedAt = now;
  next.metrics = computeMetrics(next.sessions, next.payments, next.settings);
  return next;
}

export class StallStore {
  constructor() {
    this.syncConfig = loadSyncConfig();
    this.activeBackend = 'local'; // 'server' | 'firebase' | 'local'
    this.serverBaseUrl = '';
    this.lastSyncError = '';
    this.eventSource = null;
    this.broadcastChannel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gaming-stall-ops') : null;
    this.listeners = new Set();
    this.state = null;
    this.clockOffsetMs = 0;
  }

  onUpdate(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(state, syncStatus = 'connected') {
    this.state = state;
    if (state?.serverNow) {
      this.clockOffsetMs = state.serverNow - Date.now();
    }
    for (const fn of this.listeners) {
      fn(state, {
        backend: this.activeBackend,
        syncStatus,
        serverBaseUrl: this.serverBaseUrl,
        lastError: this.lastSyncError,
      });
    }
  }

  nowMs() {
    return Date.now() + this.clockOffsetMs;
  }

  async init() {
    this.syncConfig = loadSyncConfig();
    this.closeStreams();
    this.lastSyncError = '';

    if (this.broadcastChannel) {
      this.broadcastChannel.onmessage = (evt) => {
        if (this.activeBackend === 'local' && evt.data?.type === 'snapshot') {
          this.emit(normalizeSnapshot(evt.data.snapshot, { mode: 'local', networkUrls: [location.origin] }), 'local');
        }
      };
    }

    // 1. Check explicit or same-origin server
    const candidateServer =
      this.syncConfig.mode === 'server' && this.syncConfig.serverUrl
        ? this.syncConfig.serverUrl
        : this.syncConfig.mode === 'auto' && this.syncConfig.serverUrl
          ? this.syncConfig.serverUrl
          : this.syncConfig.mode !== 'local' && this.syncConfig.mode !== 'firebase'
            ? ''
            : null;

    if (candidateServer !== null && location.protocol !== 'file:') {
      try {
        const healthUrl = `${candidateServer}/api/health`;
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) {
          throw new Error(`Server health returned HTTP ${res.status}`);
        }
        const info = await res.json();
        if (!info?.ok) {
          throw new Error('Server health check did not return ok=true');
        }
        this.activeBackend = 'server';
        this.serverBaseUrl = candidateServer;
        const stateRes = await fetch(`${candidateServer}/api/state`, { cache: 'no-store' });
        if (!stateRes.ok) {
          throw new Error(`Failed to fetch /api/state (HTTP ${stateRes.status})`);
        }
        const snap = normalizeSnapshot(await stateRes.json());
        await writeIdbSnapshot(snap);
        this.emit(snap, 'connected');
        this.connectServerSse();
        return snap;
      } catch (err) {
        if (this.syncConfig.mode === 'server' || this.syncConfig.serverUrl) {
          this.lastSyncError = `Server unreachable (${err?.message || 'network error'}). Using fallback storage.`;
        }
      }
    }

    // 2. Check Firebase RTDB if configured
    if (this.syncConfig.mode === 'firebase' && !this.syncConfig.firebaseUrl) {
      this.lastSyncError = 'Enter a Firebase Realtime DB URL before selecting Firebase mode.';
    } else if (
      (this.syncConfig.mode === 'firebase' || this.syncConfig.mode === 'auto') &&
      this.syncConfig.firebaseUrl
    ) {
      try {
        const { snapshot } = await this.fetchFirebaseSnapshot({ withEtag: false });
        this.activeBackend = 'firebase';
        this.serverBaseUrl = '';
        await writeIdbSnapshot(snapshot);
        this.emit(snapshot, 'connected');
        this.connectFirebaseSse();
        return snapshot;
      } catch (err) {
        this.lastSyncError = `Firebase sync failed (${err?.message || 'check URL & RTDB rules'}). Using Phone Storage.`;
      }
    }

    // 3. Offline / Static GitHub Pages fallback (IndexedDB + localStorage)
    this.activeBackend = 'local';
    this.serverBaseUrl = '';
    const localSnap = await readLocalFallbackSnapshot();
    this.emit(localSnap, 'local');
    return localSnap;
  }

  closeStreams() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  connectServerSse() {
    this.closeStreams();
    const sse = new EventSource(`${this.serverBaseUrl}/api/events`);
    sse.addEventListener('snapshot', async (evt) => {
      try {
        const snap = normalizeSnapshot(JSON.parse(evt.data));
        await writeIdbSnapshot(snap);
        this.emit(snap, 'connected');
      } catch {
        // Ignore bad event payload
      }
    });
    sse.onerror = () => {
      if (this.state) this.emit(this.state, 'reconnecting');
    };
    this.eventSource = sse;
  }

  _firebaseMeta() {
    return { mode: 'firebase', firebaseUrl: this.syncConfig.firebaseUrl, networkUrls: [location.href] };
  }

  async fetchFirebaseSnapshot({ withEtag = false } = {}) {
    const url = `${this.syncConfig.firebaseUrl}/stall_state.json`;
    const headers = withEtag ? { 'X-Firebase-ETag': 'true' } : {};
    const res = await fetch(url, { cache: 'no-store', headers });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`HTTP ${res.status} Permission Denied — check Firebase Realtime DB rules`);
      }
      throw new Error(`Firebase read error HTTP ${res.status}`);
    }
    let etag = res.headers.get('etag');
    let data = await res.json();
    if (!data || !data.laptops || (Array.isArray(data.laptops) && data.laptops.length === 0)) {
      const fallback = await readLocalFallbackSnapshot();
      const seedPayload = { ...fallback };
      delete seedPayload.meta;
      const initHeaders = { 'Content-Type': 'application/json' };
      if (etag) initHeaders['If-Match'] = etag;
      const putRes = await fetch(url, {
        method: 'PUT',
        headers: initHeaders,
        body: JSON.stringify(seedPayload),
      });
      if (!putRes.ok && putRes.status !== 412) {
        throw new Error(`Firebase init write failed (HTTP ${putRes.status})`);
      }
      if (putRes.status === 412) {
        return this.fetchFirebaseSnapshot({ withEtag });
      }
      etag = putRes.headers.get('etag') || etag;
      data = seedPayload;
    }
    const snapshot = normalizeSnapshot(data, this._firebaseMeta());
    return { snapshot, etag };
  }

  connectFirebaseSse() {
    this.closeStreams();
    const sse = new EventSource(`${this.syncConfig.firebaseUrl}/stall_state.json`);
    sse.addEventListener('put', async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg?.path === '/' && msg.data && msg.data.laptops) {
          const snap = normalizeSnapshot(msg.data, this._firebaseMeta());
          await writeIdbSnapshot(snap);
          this.emit(snap, 'connected');
        } else {
          const { snapshot } = await this.fetchFirebaseSnapshot();
          await writeIdbSnapshot(snapshot);
          this.emit(snapshot, 'connected');
        }
      } catch {
        // Ignore transient SSE parse issue
      }
    });
    sse.addEventListener('patch', async () => {
      try {
        const { snapshot } = await this.fetchFirebaseSnapshot();
        await writeIdbSnapshot(snapshot);
        this.emit(snapshot, 'connected');
      } catch {
        // Ignore
      }
    });
    sse.onerror = () => {
      if (this.state) this.emit(this.state, 'reconnecting');
    };
    this.eventSource = sse;
  }

  async serverFetch(path, method = 'POST', body = undefined) {
    const headers = { 'Content-Type': 'application/json' };
    const pin = getSavedPin();
    if (pin) headers['X-Stall-Pin'] = pin;

    const res = await fetch(`${this.serverBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.pinRequired = Boolean(data.pinRequired);
      throw err;
    }
    const clean = normalizeSnapshot(data);
    await writeIdbSnapshot(clean);
    this.emit(clean, 'connected');
    return clean;
  }

  async mutate(serverMethod, serverPath, serverBody, localOp, localPayload) {
    if (this.activeBackend === 'server') {
      return this.serverFetch(serverPath, serverMethod, serverBody);
    }

    if (this.activeBackend === 'firebase') {
      const maxAttempts = 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { snapshot: current, etag } = await this.fetchFirebaseSnapshot({ withEtag: true });
        const next = applyLocalMutation(current, localOp, localPayload);
        const remotePayload = { ...next };
        delete remotePayload.meta;

        const headers = { 'Content-Type': 'application/json' };
        if (etag) headers['If-Match'] = etag;

        const putRes = await fetch(`${this.syncConfig.firebaseUrl}/stall_state.json`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(remotePayload),
        });
        if (putRes.status === 412 && attempt < maxAttempts) {
          continue;
        }
        if (!putRes.ok) {
          throw new Error(`Firebase write failed (HTTP ${putRes.status})`);
        }
        next.meta = this._firebaseMeta();
        await writeIdbSnapshot(next);
        this.emit(next, 'connected');
        return next;
      }
      throw new Error('Firebase concurrent write conflict — please retry.');
    }

    const base = this.state || (await readLocalFallbackSnapshot());
    const next = applyLocalMutation(base, localOp, localPayload);
    next.meta = { mode: 'local', networkUrls: [location.href] };
    await writeIdbSnapshot(next);
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: 'snapshot', snapshot: next });
    }
    this.emit(next, 'local');
    return next;
  }

  updateSettings(patch) {
    return this.mutate('PATCH', '/api/settings', patch, 'updateSettings', patch);
  }
  addLaptop(payload) {
    return this.mutate('POST', '/api/laptops', payload, 'addLaptop', payload);
  }
  updateLaptop(id, patch) {
    return this.mutate('PATCH', `/api/laptops/${encodeURIComponent(id)}`, patch, 'updateLaptop', { id, ...patch });
  }
  addGameToLaptop(laptopId, payload) {
    return this.mutate('POST', `/api/laptops/${encodeURIComponent(laptopId)}/games`, payload, 'addGame', { laptopId, ...payload });
  }
  toggleGameInstalled(laptopId, gameId) {
    return this.mutate(
      'PATCH',
      `/api/laptops/${encodeURIComponent(laptopId)}/games/${encodeURIComponent(gameId)}/toggle`,
      {},
      'toggleGame',
      { laptopId, gameId },
    );
  }
  removeGameFromLaptop(laptopId, gameId) {
    return this.mutate(
      'DELETE',
      `/api/laptops/${encodeURIComponent(laptopId)}/games/${encodeURIComponent(gameId)}`,
      undefined,
      'removeGame',
      { laptopId, gameId },
    );
  }
  startSession(payload) {
    return this.mutate('POST', '/api/sessions', payload, 'startSession', payload);
  }
  extendSession(sessionId, payload) {
    return this.mutate(
      'POST',
      `/api/sessions/${encodeURIComponent(sessionId)}/extend`,
      payload,
      'extendSession',
      { sessionId, ...payload },
    );
  }
  endSession(sessionId, payload = {}) {
    return this.mutate(
      'POST',
      `/api/sessions/${encodeURIComponent(sessionId)}/end`,
      payload,
      'endSession',
      { sessionId, ...payload },
    );
  }
  recordPayment(payload) {
    return this.mutate('POST', '/api/payments', payload, 'recordPayment', payload);
  }
  togglePaymentPaperChecked(paymentId) {
    return this.mutate(
      'PATCH',
      `/api/payments/${encodeURIComponent(paymentId)}/paper-check`,
      {},
      'togglePaperChecked',
      { paymentId },
    );
  }
  voidPayment(paymentId) {
    return this.mutate(
      'POST',
      `/api/payments/${encodeURIComponent(paymentId)}/void`,
      {},
      'voidPayment',
      { paymentId },
    );
  }
  resetDay() {
    return this.mutate('POST', '/api/reset-day', {}, 'resetDay', {});
  }
  importSnapshot(payload) {
    return this.mutate('POST', '/api/import', payload, 'importSnapshot', payload);
  }

  async requestAiBrief(question = '') {
    if (this.activeBackend !== 'server') {
      return {
        ok: false,
        message:
          'Google Antigravity SDK runs in Python on your host machine. Start the local server (npm start) or run: uv --directory agent run python stall_analyst.py summary',
      };
    }
    const headers = { 'Content-Type': 'application/json' };
    const pin = getSavedPin();
    if (pin) headers['X-Stall-Pin'] = pin;
    const res = await fetch(`${this.serverBaseUrl}/api/ai-brief`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question }),
    });
    return res.json();
  }

  getQrUrl(targetUrl) {
    if (this.activeBackend === 'server') {
      return `${this.serverBaseUrl}/api/qr?text=${encodeURIComponent(targetUrl)}`;
    }
    return '';
  }
}
