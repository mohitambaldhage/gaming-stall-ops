import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StallDatabase } from '../server/db.mjs';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-db-test-'));
  const dbPath = path.join(dir, 'stall.db');
  return { dir, dbPath };
}

test('StallDatabase seeds exact 7 laptops, games, and install statuses', () => {
  const { dir, dbPath } = makeTempDb();
  try {
    const db = new StallDatabase(dbPath);
    const snap = db.getSnapshot();
    assert.equal(snap.laptops.length, 7);
    assert.equal(snap.settings.ratePerSlot, 149);
    assert.equal(snap.settings.slotMinutes, 30);
    assert.equal(snap.settings.noPauseRule, true);

    const mohit = snap.laptops.find((l) => l.owner === 'Mohit');
    assert.ok(mohit);
    assert.equal(mohit.games.find((g) => g.title.includes('Spider-Man 2')).installed, false);
    assert.ok(mohit.games.some((g) => g.title === 'Cyberpunk 2077' && g.installed));

    const rohan = snap.laptops.find((l) => l.owner === 'Rohan');
    assert.equal(rohan.games.filter((g) => g.title === 'Roblox').length, 1);

    const aravind = snap.laptops.find((l) => l.owner === 'Aravind');
    assert.equal(aravind.games.find((g) => g.title === 'GTA 5').installed, false);

    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Session lifecycle, no-pause constraint, +30m extension, and persistence across reopen', () => {
  const { dir, dbPath } = makeTempDb();
  try {
    let db = new StallDatabase(dbPath);
    const s1 = db.startSession({
      laptopId: 'l1-mohit',
      gameTitle: 'GTA 5',
      playerName: 'Aarav',
      paymentMethod: 'cash',
    });

    assert.equal(s1.sessions.length, 1);
    assert.equal(s1.payments.length, 1);
    assert.equal(s1.metrics.collectedTotal, 149);
    assert.equal(s1.metrics.expectedRevenue, 149);
    assert.equal(s1.metrics.diffAmount, 0);

    // Cannot start second concurrent session on same laptop
    assert.throws(
      () => db.startSession({ laptopId: 'l1-mohit', gameTitle: 'Valorant', paymentMethod: 'upi' }),
      /already has an active session/,
    );

    const sessionId = s1.sessions[0].id;
    const beforeEnd = s1.sessions[0].endsAt;

    // Extend +30m unpaid -> cross-check detects -149 shortfall immediately
    const s2 = db.extendSession(sessionId, { paymentMethod: 'unpaid', blocks: 1 });
    assert.equal(s2.sessions[0].blocksCount, 2);
    assert.equal(s2.sessions[0].endsAt - beforeEnd, 30 * 60_000);
    assert.equal(s2.metrics.expectedRevenue, 298);
    assert.equal(s2.metrics.collectedTotal, 149);
    assert.equal(s2.metrics.diffAmount, -149);

    // Quick +1 UPI payment reconciles cross-check to 0
    const s3 = db.recordPayment({ method: 'upi', slots: 1 });
    assert.equal(s3.metrics.upiTotal, 149);
    assert.equal(s3.metrics.cashTotal, 149);
    assert.equal(s3.metrics.diffAmount, 0);

    // Toggle paper check and close DB to test disk persistence
    const payId = s3.payments[0].id;
    db.togglePaymentPaperChecked(payId);
    db.endSession(sessionId, { cancel: false });
    db.close();

    db = new StallDatabase(dbPath);
    const reopened = db.getSnapshot();
    assert.equal(reopened.sessions[0].status, 'completed');
    assert.equal(reopened.payments.find((p) => p.id === payId).paperChecked, true);
    assert.equal(reopened.metrics.collectedTotal, 298);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Adding laptops, toggling games, voiding mistakes, and resetDay preserve inventory', () => {
  const { dir, dbPath } = makeTempDb();
  try {
    const db = new StallDatabase(dbPath);
    const afterAdd = db.addLaptop({
      owner: 'Kabir',
      specs: 'RTX 4060',
      games: ['FIFA 25', 'GTA 5'],
    });
    assert.equal(afterAdd.laptops.length, 8);
    const kabir = afterAdd.laptops.find((l) => l.owner === 'Kabir');
    assert.equal(kabir.code, 'L8');

    const afterToggle = db.toggleGameInstalled('l7-aravind', 'l7-gta5');
    assert.equal(
      afterToggle.laptops.find((l) => l.id === 'l7-aravind').games.find((g) => g.id === 'l7-gta5')
        .installed,
      true,
    );

    const started = db.startSession({
      laptopId: kabir.id,
      gameTitle: 'FIFA 25',
      paymentMethod: 'cash',
    });
    const sessionId = started.sessions[0].id;
    const payId = started.payments[0].id;

    db.endSession(sessionId, { cancel: true });
    const afterVoid = db.voidPayment(payId);
    assert.equal(afterVoid.metrics.totalValidSlotsPlayed, 0);
    assert.equal(afterVoid.metrics.collectedTotal, 0);

    const reset = db.resetDay();
    assert.equal(reset.sessions.length, 0);
    assert.equal(reset.payments.length, 0);
    assert.equal(reset.laptops.length, 8);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
