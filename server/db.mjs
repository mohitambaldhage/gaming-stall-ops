import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SETTINGS, INITIAL_LAPTOPS } from './seed.mjs';

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function sanitizeText(value, maxLen = 140) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}

function normalizeGames(games) {
  if (!Array.isArray(games)) return [];
  const seen = new Set();
  const clean = [];
  for (const raw of games) {
    const title = sanitizeText(typeof raw === 'string' ? raw : raw?.title, 100);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({
      id: sanitizeText(raw?.id, 48) || makeId('g'),
      title,
      installed: raw?.installed !== false,
      note: sanitizeText(raw?.note, 60),
    });
  }
  return clean;
}

export function computeMetrics(sessions, payments, settings) {
  const rate = Number(settings?.ratePerSlot || 149);
  const validSessions = sessions.filter((s) => s.status !== 'cancelled');
  const activeSessions = validSessions.filter((s) => s.status === 'active');
  const completedSessions = validSessions.filter((s) => s.status === 'completed');

  let totalValidSlotsPlayed = 0;
  let expectedRevenue = 0;
  for (const s of validSessions) {
    const blocks = Number(s.blocksCount || 1);
    const sRate = Number(s.ratePerSlot || rate);
    totalValidSlotsPlayed += blocks;
    expectedRevenue += blocks * sRate;
  }

  const validPayments = payments.filter((p) => !p.voidedAt);
  let cashCount = 0;
  let cashTotal = 0;
  let upiCount = 0;
  let upiTotal = 0;
  let paidSlotsCount = 0;
  let paperCheckedCount = 0;

  for (const p of validPayments) {
    const amt = Number(p.amount || 0);
    const slots = Number(p.slots || 1);
    paidSlotsCount += slots;
    if (p.paperChecked) paperCheckedCount += 1;
    if (p.method === 'upi') {
      upiCount += slots;
      upiTotal += amt;
    } else {
      cashCount += slots;
      cashTotal += amt;
    }
  }

  const collectedTotal = cashTotal + upiTotal;
  return {
    activeSessionsCount: activeSessions.length,
    completedSessionsCount: completedSessions.length,
    totalSessionsCount: validSessions.length,
    totalValidSlotsPlayed,
    expectedRevenue,
    cashCount,
    cashTotal,
    upiCount,
    upiTotal,
    collectedTotal,
    paidSlotsCount,
    paymentEntriesCount: validPayments.length,
    diffAmount: collectedTotal - expectedRevenue,
    diffSlots: paidSlotsCount - totalValidSlotsPlayed,
    paperCheckedCount,
  };
}

export class StallDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
    this.ensureSeeded();
  }

  close() {
    this.db.close();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS laptops (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        owner TEXT NOT NULL,
        ownership TEXT NOT NULL DEFAULT 'Friend',
        specs TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 1,
        games_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        slip_no INTEGER NOT NULL,
        laptop_id TEXT NOT NULL,
        laptop_code TEXT NOT NULL,
        laptop_owner TEXT NOT NULL,
        player_name TEXT NOT NULL DEFAULT '',
        game_title TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        ended_at INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        blocks_count INTEGER NOT NULL DEFAULT 1,
        rate_per_slot INTEGER NOT NULL DEFAULT 149,
        slot_minutes INTEGER NOT NULL DEFAULT 30,
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        receipt_no INTEGER NOT NULL,
        method TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 149,
        slots INTEGER NOT NULL DEFAULT 1,
        session_id TEXT,
        laptop_id TEXT,
        laptop_code TEXT,
        player_name TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        paper_checked INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        voided_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_laptop ON sessions(laptop_id);
      CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
    `);
  }

  ensureSeeded() {
    const settingsRow = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('app');
    if (!settingsRow) {
      this.db
        .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('app', JSON.stringify(DEFAULT_SETTINGS));
    }

    const countRow = this.db.prepare('SELECT COUNT(*) AS cnt FROM laptops').get();
    if (Number(countRow.cnt) === 0) {
      const insert = this.db.prepare(`
        INSERT INTO laptops (id, code, owner, ownership, specs, notes, active, sort_order, games_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      this.transaction(() => {
        for (const rig of INITIAL_LAPTOPS) {
          insert.run(
            rig.id,
            rig.code,
            rig.owner,
            rig.ownership,
            rig.specs,
            rig.notes || '',
            rig.active ? 1 : 0,
            rig.sortOrder,
            JSON.stringify(normalizeGames(rig.games)),
          );
        }
      });
    }
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure if transaction was already closed
      }
      throw err;
    }
  }

  getSettings() {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('app');
    if (!row) return { ...DEFAULT_SETTINGS };
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  updateSettings(patch) {
    const current = this.getSettings();
    const ratePerSlot = Number(patch?.ratePerSlot ?? current.ratePerSlot);
    const slotMinutes = Number(patch?.slotMinutes ?? current.slotMinutes);
    if (!Number.isFinite(ratePerSlot) || ratePerSlot < 1 || ratePerSlot > 100000) {
      throw new Error('ratePerSlot must be between 1 and 100000');
    }
    if (!Number.isFinite(slotMinutes) || slotMinutes < 1 || slotMinutes > 480) {
      throw new Error('slotMinutes must be between 1 and 480');
    }
    const next = {
      ...current,
      stallName: sanitizeText(patch?.stallName ?? current.stallName, 80) || current.stallName,
      eventDate: sanitizeText(patch?.eventDate ?? current.eventDate, 20) || current.eventDate,
      openTime: sanitizeText(patch?.openTime ?? current.openTime, 10) || current.openTime,
      ratePerSlot: Math.round(ratePerSlot),
      slotMinutes: Math.round(slotMinutes),
      noPauseRule: true,
      currencySymbol: '₹',
    };
    this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run('app', JSON.stringify(next));
    return this.getSnapshot();
  }

  getLaptops() {
    const rows = this.db
      .prepare('SELECT * FROM laptops ORDER BY sort_order ASC, code ASC')
      .all();
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      owner: row.owner,
      ownership: row.ownership,
      specs: row.specs,
      notes: row.notes,
      active: Boolean(row.active),
      sortOrder: row.sort_order,
      games: JSON.parse(row.games_json || '[]'),
    }));
  }

  getSessions() {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY started_at DESC, slip_no DESC')
      .all();
    return rows.map((r) => ({
      id: r.id,
      slipNo: r.slip_no,
      laptopId: r.laptop_id,
      laptopCode: r.laptop_code,
      laptopOwner: r.laptop_owner,
      playerName: r.player_name,
      gameTitle: r.game_title,
      startedAt: r.started_at,
      endsAt: r.ends_at,
      endedAt: r.ended_at,
      status: r.status,
      blocksCount: r.blocks_count,
      ratePerSlot: r.rate_per_slot,
      slotMinutes: r.slot_minutes,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getPayments() {
    const rows = this.db
      .prepare('SELECT * FROM payments ORDER BY receipt_no DESC, created_at DESC')
      .all();
    return rows.map((p) => ({
      id: p.id,
      receiptNo: p.receipt_no,
      method: p.method,
      amount: p.amount,
      slots: p.slots,
      sessionId: p.session_id,
      laptopId: p.laptop_id,
      laptopCode: p.laptop_code,
      playerName: p.player_name,
      note: p.note,
      paperChecked: Boolean(p.paper_checked),
      createdAt: p.created_at,
      voidedAt: p.voided_at,
    }));
  }

  getSnapshot() {
    const settings = this.getSettings();
    const laptops = this.getLaptops();
    const sessions = this.getSessions();
    const payments = this.getPayments();
    const now = Date.now();
    return {
      version: 1,
      serverNow: now,
      updatedAt: now,
      settings,
      laptops,
      sessions,
      payments,
      metrics: computeMetrics(sessions, payments, settings),
    };
  }

  addLaptop({ code, owner, ownership = 'Friend', specs = '', notes = '', games = [] }) {
    const cleanOwner = sanitizeText(owner, 60);
    if (!cleanOwner) throw new Error('Owner name is required');
    const existing = this.getLaptops();
    const nextOrder = existing.length
      ? Math.max(...existing.map((l) => Number(l.sortOrder || 0))) + 1
      : 1;
    const cleanCode = sanitizeText(code, 12) || `L${nextOrder}`;
    const id = makeId(`l${nextOrder}`);
    const cleanGames = normalizeGames(games);

    this.db
      .prepare(`
        INSERT INTO laptops (id, code, owner, ownership, specs, notes, active, sort_order, games_json)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .run(
        id,
        cleanCode,
        cleanOwner,
        sanitizeText(ownership, 24) || 'Friend',
        sanitizeText(specs, 160),
        sanitizeText(notes, 160),
        nextOrder,
        JSON.stringify(cleanGames),
      );

    return this.getSnapshot();
  }

  updateLaptop(id, patch) {
    const row = this.db.prepare('SELECT * FROM laptops WHERE id = ?').get(id);
    if (!row) throw new Error('Laptop not found');
    const currentGames = JSON.parse(row.games_json || '[]');
    const nextGames = patch.games !== undefined ? normalizeGames(patch.games) : currentGames;

    this.db
      .prepare(`
        UPDATE laptops
        SET code = ?, owner = ?, ownership = ?, specs = ?, notes = ?, active = ?, games_json = ?
        WHERE id = ?
      `)
      .run(
        sanitizeText(patch.code ?? row.code, 12) || row.code,
        sanitizeText(patch.owner ?? row.owner, 60) || row.owner,
        sanitizeText(patch.ownership ?? row.ownership, 24) || row.ownership,
        sanitizeText(patch.specs ?? row.specs, 160),
        sanitizeText(patch.notes ?? row.notes, 160),
        patch.active !== undefined ? (patch.active ? 1 : 0) : row.active,
        JSON.stringify(nextGames),
        id,
      );

    return this.getSnapshot();
  }

  addGameToLaptop(laptopId, { title, installed = true, note = '' }) {
    const row = this.db.prepare('SELECT * FROM laptops WHERE id = ?').get(laptopId);
    if (!row) throw new Error('Laptop not found');
    const cleanTitle = sanitizeText(title, 100);
    if (!cleanTitle) throw new Error('Game title is required');
    const games = JSON.parse(row.games_json || '[]');
    if (games.some((g) => g.title.toLowerCase() === cleanTitle.toLowerCase())) {
      throw new Error('Game already listed on this laptop');
    }
    games.push({
      id: makeId('g'),
      title: cleanTitle,
      installed: Boolean(installed),
      note: sanitizeText(note, 60),
    });
    this.db
      .prepare('UPDATE laptops SET games_json = ? WHERE id = ?')
      .run(JSON.stringify(games), laptopId);
    return this.getSnapshot();
  }

  toggleGameInstalled(laptopId, gameId) {
    const row = this.db.prepare('SELECT * FROM laptops WHERE id = ?').get(laptopId);
    if (!row) throw new Error('Laptop not found');
    const games = JSON.parse(row.games_json || '[]');
    const target = games.find((g) => g.id === gameId);
    if (!target) throw new Error('Game not found on laptop');
    target.installed = !target.installed;
    if (target.installed && /install/i.test(target.note || '')) {
      target.note = '';
    } else if (!target.installed && !target.note) {
      target.note = 'To install';
    }
    this.db
      .prepare('UPDATE laptops SET games_json = ? WHERE id = ?')
      .run(JSON.stringify(games), laptopId);
    return this.getSnapshot();
  }

  removeGameFromLaptop(laptopId, gameId) {
    const row = this.db.prepare('SELECT * FROM laptops WHERE id = ?').get(laptopId);
    if (!row) throw new Error('Laptop not found');
    const games = JSON.parse(row.games_json || '[]').filter((g) => g.id !== gameId);
    this.db
      .prepare('UPDATE laptops SET games_json = ? WHERE id = ?')
      .run(JSON.stringify(games), laptopId);
    return this.getSnapshot();
  }

  startSession({ laptopId, gameTitle, playerName = '', paymentMethod = 'unpaid', notes = '' }) {
    const laptop = this.db.prepare('SELECT * FROM laptops WHERE id = ?').get(laptopId);
    if (!laptop) throw new Error('Laptop not found');

    const cleanGame = sanitizeText(gameTitle, 100);
    if (!cleanGame) throw new Error('Select or enter a game title');

    const method = ['cash', 'upi', 'unpaid'].includes(paymentMethod)
      ? paymentMethod
      : 'unpaid';

    return this.transaction(() => {
      const existingActive = this.db
        .prepare("SELECT id FROM sessions WHERE laptop_id = ? AND status = 'active'")
        .get(laptopId);
      if (existingActive) {
        throw new Error(`${laptop.code} already has an active session running`);
      }

      const settings = this.getSettings();
      const now = Date.now();
      const slotMinutes = Number(settings.slotMinutes || 30);
      const ratePerSlot = Number(settings.ratePerSlot || 149);
      const maxSlip = this.db.prepare('SELECT COALESCE(MAX(slip_no), 0) AS m FROM sessions').get();
      const slipNo = Number(maxSlip.m) + 1;
      const sessionId = makeId('sess');
      const endsAt = now + slotMinutes * 60_000;
      const cleanPlayer = sanitizeText(playerName, 60) || `Player #${slipNo}`;

      this.db
        .prepare(`
          INSERT INTO sessions (
            id, slip_no, laptop_id, laptop_code, laptop_owner, player_name,
            game_title, started_at, ends_at, ended_at, status, blocks_count,
            rate_per_slot, slot_minutes, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', 1, ?, ?, ?, ?, ?)
        `)
        .run(
          sessionId,
          slipNo,
          laptop.id,
          laptop.code,
          laptop.owner,
          cleanPlayer,
          cleanGame,
          now,
          endsAt,
          ratePerSlot,
          slotMinutes,
          sanitizeText(notes, 160),
          now,
          now,
        );

      if (method === 'cash' || method === 'upi') {
        this._insertPayment({
          method,
          amount: ratePerSlot,
          slots: 1,
          sessionId,
          laptopId: laptop.id,
          laptopCode: laptop.code,
          playerName: cleanPlayer,
          note: `${cleanGame} (Slip #${slipNo})`,
          createdAt: now,
        });
      }

      return this.getSnapshot();
    });
  }

  extendSession(sessionId, { paymentMethod = 'unpaid', blocks = 1 } = {}) {
    const addBlocks = Math.max(1, Math.min(6, Math.round(Number(blocks || 1))));
    const method = ['cash', 'upi', 'unpaid'].includes(paymentMethod)
      ? paymentMethod
      : 'unpaid';

    return this.transaction(() => {
      const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      if (!session) throw new Error('Session not found');
      if (session.status !== 'active') throw new Error('Only active sessions can be extended');

      const now = Date.now();
      const addMs = addBlocks * session.slot_minutes * 60_000;
      // Add block from whichever is later: current ends_at (if time left) or now (if already overtime? Wait: if overtime, extending adds 30 min onto ends_at so overtime stops or adds from now? Let's make sure adding +30m onto ends_at or max(ends_at, now) works cleanly: if only 1 min overtime, ends_at + 30m charges the exact 30m slot they went into; if long overtime, max(ends_at, now) avoids starting already expired. Better: Math.max(session.ends_at, now) + addMs when far past, OR session.ends_at + addMs if < slot_minutes? Actually Math.max(session.ends_at, now) gives a fresh 30m if overtime exceeded a full slot, while session.ends_at + addMs keeps exact boundary inside the overtime window! Even simpler: if now <= session.ends_at -> session.ends_at + addMs; if overtime -> now + addMs? Wait: if timer expired 5 seconds ago and player says "1 more half hour!", giving them ends_at + 30m (29:55 left) is completely fair!).
      const base =
        now - session.ends_at < session.slot_minutes * 60_000 ? session.ends_at : now;
      const nextEndsAt = base + addMs;
      const nextBlocks = session.blocks_count + addBlocks;

      this.db
        .prepare('UPDATE sessions SET blocks_count = ?, ends_at = ?, updated_at = ? WHERE id = ?')
        .run(nextBlocks, nextEndsAt, now, sessionId);

      if (method === 'cash' || method === 'upi') {
        this._insertPayment({
          method,
          amount: addBlocks * session.rate_per_slot,
          slots: addBlocks,
          sessionId: session.id,
          laptopId: session.laptop_id,
          laptopCode: session.laptop_code,
          playerName: session.player_name,
          note: `+${addBlocks * session.slot_minutes}m ext (${session.game_title})`,
          createdAt: now,
        });
      }

      return this.getSnapshot();
    });
  }

  endSession(sessionId, { cancel = false } = {}) {
    return this.transaction(() => {
      const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      if (!session) throw new Error('Session not found');
      if (session.status !== 'active') throw new Error('Session is already closed');
      const now = Date.now();
      const nextStatus = cancel ? 'cancelled' : 'completed';
      this.db
        .prepare('UPDATE sessions SET status = ?, ended_at = ?, updated_at = ? WHERE id = ?')
        .run(nextStatus, now, now, sessionId);
      return this.getSnapshot();
    });
  }

  _insertPayment({
    method,
    amount,
    slots = 1,
    sessionId = null,
    laptopId = null,
    laptopCode = null,
    playerName = '',
    note = '',
    createdAt = Date.now(),
  }) {
    const cleanMethod = method === 'upi' ? 'upi' : 'cash';
    const maxRec = this.db.prepare('SELECT COALESCE(MAX(receipt_no), 0) AS m FROM payments').get();
    const receiptNo = Number(maxRec.m) + 1;
    const id = makeId('pay');

    this.db
      .prepare(`
        INSERT INTO payments (
          id, receipt_no, method, amount, slots, session_id,
          laptop_id, laptop_code, player_name, note, paper_checked, created_at, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)
      `)
      .run(
        id,
        receiptNo,
        cleanMethod,
        Math.round(Number(amount)),
        Math.round(Number(slots)),
        sessionId,
        laptopId,
        laptopCode,
        sanitizeText(playerName, 60),
        sanitizeText(note, 140),
        createdAt,
      );
    return id;
  }

  recordPayment({
    method = 'cash',
    slots = 1,
    amount,
    sessionId = null,
    laptopId = null,
    playerName = '',
    note = '',
  }) {
    const cleanSlots = Math.max(1, Math.min(20, Math.round(Number(slots || 1))));
    const settings = this.getSettings();
    const rate = Number(settings.ratePerSlot || 149);
    const cleanAmount =
      amount !== undefined && Number.isFinite(Number(amount)) && Number(amount) > 0
        ? Math.round(Number(amount))
        : cleanSlots * rate;

    return this.transaction(() => {
      let resolvedLaptopCode = null;
      if (laptopId) {
        const lap = this.db.prepare('SELECT code FROM laptops WHERE id = ?').get(laptopId);
        if (lap) resolvedLaptopCode = lap.code;
      }
      this._insertPayment({
        method: method === 'upi' ? 'upi' : 'cash',
        amount: cleanAmount,
        slots: cleanSlots,
        sessionId: sessionId || null,
        laptopId: laptopId || null,
        laptopCode: resolvedLaptopCode,
        playerName,
        note,
        createdAt: Date.now(),
      });
      return this.getSnapshot();
    });
  }

  togglePaymentPaperChecked(paymentId) {
    const p = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!p) throw new Error('Payment not found');
    const next = p.paper_checked ? 0 : 1;
    this.db.prepare('UPDATE payments SET paper_checked = ? WHERE id = ?').run(next, paymentId);
    return this.getSnapshot();
  }

  voidPayment(paymentId) {
    const p = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!p) throw new Error('Payment not found');
    if (p.voided_at) throw new Error('Payment already voided');
    this.db
      .prepare('UPDATE payments SET voided_at = ? WHERE id = ?')
      .run(Date.now(), paymentId);
    return this.getSnapshot();
  }

  resetDay() {
    return this.transaction(() => {
      this.db.exec('DELETE FROM sessions');
      this.db.exec('DELETE FROM payments');
      return this.getSnapshot();
    });
  }

  importSnapshot(payload, { resetTransactions = false } = {}) {
    if (!payload || !Array.isArray(payload.laptops)) {
      throw new Error('Invalid backup payload');
    }
    return this.transaction(() => {
      if (payload.settings) {
        const merged = { ...DEFAULT_SETTINGS, ...payload.settings, noPauseRule: true, currencySymbol: '₹' };
        this.db
          .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run('app', JSON.stringify(merged));
      }

      this.db.exec('DELETE FROM laptops');
      const insertLaptop = this.db.prepare(`
        INSERT INTO laptops (id, code, owner, ownership, specs, notes, active, sort_order, games_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      payload.laptops.forEach((rig, idx) => {
        insertLaptop.run(
          sanitizeText(rig.id, 48) || makeId('l'),
          sanitizeText(rig.code, 12) || `L${idx + 1}`,
          sanitizeText(rig.owner, 60) || `Laptop ${idx + 1}`,
          sanitizeText(rig.ownership, 24) || 'Friend',
          sanitizeText(rig.specs, 160),
          sanitizeText(rig.notes, 160),
          rig.active !== false ? 1 : 0,
          Number(rig.sortOrder || idx + 1),
          JSON.stringify(normalizeGames(rig.games || [])),
        );
      });

      if (resetTransactions || Array.isArray(payload.sessions)) {
        this.db.exec('DELETE FROM sessions');
        const insertSession = this.db.prepare(`
          INSERT INTO sessions (
            id, slip_no, laptop_id, laptop_code, laptop_owner, player_name,
            game_title, started_at, ends_at, ended_at, status, blocks_count,
            rate_per_slot, slot_minutes, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of payload.sessions || []) {
          insertSession.run(
            s.id || makeId('sess'),
            Number(s.slipNo || 1),
            s.laptopId || '',
            s.laptopCode || '',
            s.laptopOwner || '',
            sanitizeText(s.playerName, 60),
            sanitizeText(s.gameTitle, 100),
            Number(s.startedAt || Date.now()),
            Number(s.endsAt || Date.now()),
            s.endedAt ?? null,
            s.status || 'completed',
            Number(s.blocksCount || 1),
            Number(s.ratePerSlot || 149),
            Number(s.slotMinutes || 30),
            sanitizeText(s.notes, 160),
            Number(s.createdAt || Date.now()),
            Number(s.updatedAt || Date.now()),
          );
        }
      }

      if (resetTransactions || Array.isArray(payload.payments)) {
        this.db.exec('DELETE FROM payments');
        const insertPayment = this.db.prepare(`
          INSERT INTO payments (
            id, receipt_no, method, amount, slots, session_id,
            laptop_id, laptop_code, player_name, note, paper_checked, created_at, voided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of payload.payments || []) {
          insertPayment.run(
            p.id || makeId('pay'),
            Number(p.receiptNo || 1),
            p.method === 'upi' ? 'upi' : 'cash',
            Number(p.amount || 149),
            Number(p.slots || 1),
            p.sessionId || null,
            p.laptopId || null,
            p.laptopCode || null,
            sanitizeText(p.playerName, 60),
            sanitizeText(p.note, 140),
            p.paperChecked ? 1 : 0,
            Number(p.createdAt || Date.now()),
            p.voidedAt ?? null,
          );
        }
      }

      return this.getSnapshot();
    });
  }
}
