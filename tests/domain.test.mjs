import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecordsCsv,
  computeCrossCheckSummary,
  computeMetrics,
  computeRigBreakdown,
  computeScalingMatrix,
  findMatchingRigs,
  formatCurrency,
  formatDurationMMSS,
  getTimerPhase,
} from '../public/src/domain.js';
import { normalizeFirebaseUrl, normalizeSnapshot } from '../public/src/storage.js';
import { INITIAL_LAPTOPS } from '../server/seed.mjs';

test('formatDurationMMSS handles countdown and overtime cleanly', () => {
  assert.equal(formatDurationMMSS(30 * 60_000), '30:00');
  assert.equal(formatDurationMMSS(5 * 60_000 + 9_000), '05:09');
  assert.equal(formatDurationMMSS(0), '00:00');
  assert.equal(formatDurationMMSS(-65_000), '+01:05');
});

test('getTimerPhase transitions at 5m and 0m', () => {
  assert.equal(getTimerPhase(15 * 60_000), 'running');
  assert.equal(getTimerPhase(5 * 60_000), 'ending');
  assert.equal(getTimerPhase(1_000), 'ending');
  assert.equal(getTimerPhase(0), 'overtime');
  assert.equal(getTimerPhase(-2_000), 'overtime');
});

test('computeScalingMatrix calculates exact 7-laptop and 10-laptop math', () => {
  const plan = computeScalingMatrix({
    ratePerSlot: 149,
    slotMinutes: 30,
    customLaptops: 7,
    customHours: 3,
    occupancyPct: 100,
  });

  const row7 = plan.rows.find((r) => r.laptops === 7);
  const row10 = plan.rows.find((r) => r.laptops === 10);

  assert.equal(row7.rev30m, 1043);
  assert.equal(row7.rev1h, 2086);
  assert.equal(row7.rev2h, 4172);
  assert.equal(row7.rev3h, 6258);
  assert.equal(row7.isRealisticTarget, true);

  assert.equal(row10.rev30m, 1490);
  assert.equal(row10.rev3h, 8940);

  assert.equal(plan.summary.totalSlots, 42);
  assert.equal(plan.summary.fullRevenue, 6258);
  assert.equal(plan.summary.adjustedRevenue, 6258);

  const partial = computeScalingMatrix({
    ratePerSlot: 149,
    slotMinutes: 30,
    customLaptops: 7,
    customHours: 3,
    occupancyPct: 50,
  });
  assert.equal(partial.summary.adjustedRevenue, 3129);
});

test('computeMetrics and computeCrossCheckSummary detect unpaid vs matched vs advance', () => {
  const sessions = [
    { id: 's1', status: 'active', blocksCount: 2, ratePerSlot: 149 },
    { id: 's2', status: 'completed', blocksCount: 1, ratePerSlot: 149 },
    { id: 's3', status: 'cancelled', blocksCount: 1, ratePerSlot: 149 },
  ];
  const payments = [
    { id: 'p1', method: 'cash', amount: 149, slots: 1, paperChecked: true, voidedAt: null },
    { id: 'p2', method: 'upi', amount: 149, slots: 1, paperChecked: false, voidedAt: null },
    { id: 'p3', method: 'cash', amount: 149, slots: 1, paperChecked: false, voidedAt: 12345 },
  ];

  const metrics = computeMetrics(sessions, payments, { ratePerSlot: 149 });
  assert.equal(metrics.totalValidSlotsPlayed, 3);
  assert.equal(metrics.expectedRevenue, 447);
  assert.equal(metrics.collectedTotal, 298);
  assert.equal(metrics.cashTotal, 149);
  assert.equal(metrics.upiTotal, 149);
  assert.equal(metrics.diffAmount, -149);
  assert.equal(metrics.diffSlots, -1);

  const shortCC = computeCrossCheckSummary(metrics);
  assert.equal(shortCC.status, 'short');
  assert.match(shortCC.badgeText, /1 unpaid/);

  payments.push({ id: 'p4', method: 'upi', amount: 149, slots: 1, paperChecked: false, voidedAt: null });
  const matchedMetrics = computeMetrics(sessions, payments, { ratePerSlot: 149 });
  const matchedCC = computeCrossCheckSummary(matchedMetrics);
  assert.equal(matchedCC.status, 'matched');
  assert.equal(matchedCC.badgeText, 'Matched (3/3)');

  payments.push({ id: 'p5', method: 'cash', amount: 149, slots: 1, paperChecked: false, voidedAt: null });
  const aheadCC = computeCrossCheckSummary(computeMetrics(sessions, payments, { ratePerSlot: 149 }));
  assert.equal(aheadCC.status, 'ahead');
  assert.match(aheadCC.badgeText, /\+1 extra/);
});

test('findMatchingRigs prioritizes free rigs matching requested game', () => {
  const activeMap = new Map([['l4-shubodeep', { id: 's1', laptopId: 'l4-shubodeep' }]]);
  const gtaRigs = findMatchingRigs(INITIAL_LAPTOPS, activeMap, 'GTA 5');
  assert.ok(gtaRigs.some((r) => r.rig.id === 'l1-mohit'));
  assert.ok(gtaRigs.some((r) => r.rig.id === 'l4-shubodeep'));
  assert.equal(gtaRigs.at(-1).rig.id, 'l4-shubodeep');
});

test('buildRecordsCsv quotes commas and guards formula prefixes', () => {
  const csv = buildRecordsCsv(
    [
      {
        slipNo: 1,
        startedAt: Date.UTC(2026, 10, 28, 5, 30),
        laptopCode: 'L1',
        laptopOwner: 'Mohit',
        playerName: '=CMD()',
        gameTitle: 'GTA 5, Online',
        status: 'active',
        blocksCount: 1,
        ratePerSlot: 149,
      },
    ],
    [],
  );
  assert.match(csv, /'=CMD\(\)/);
  assert.match(csv, /"GTA 5, Online"/);
  assert.equal(formatCurrency(-149), '-₹149');
});

test('computeRigBreakdown aggregates sessions, slots, and expected revenue per laptop', () => {
  const sessions = [
    { id: 's1', laptopId: 'l1-mohit', status: 'active', blocksCount: 2, ratePerSlot: 149 },
    { id: 's2', laptopId: 'l1-mohit', status: 'completed', blocksCount: 1, ratePerSlot: 149 },
    { id: 's3', laptopId: 'l2-rohan', status: 'cancelled', blocksCount: 1, ratePerSlot: 149 },
  ];
  const breakdown = computeRigBreakdown(INITIAL_LAPTOPS, sessions, { ratePerSlot: 149 });
  const mohit = breakdown.find((b) => b.laptopId === 'l1-mohit');
  const rohan = breakdown.find((b) => b.laptopId === 'l2-rohan');
  assert.equal(mohit.slotsPlayed, 3);
  assert.equal(mohit.sessionsCount, 2);
  assert.equal(mohit.expectedRevenue, 447);
  assert.equal(mohit.isRunning, true);
  assert.equal(rohan.slotsPlayed, 0);
  assert.equal(rohan.expectedRevenue, 0);
});

test('normalizeFirebaseUrl and normalizeSnapshot handle stripped Firebase arrays and object maps', () => {
  assert.equal(
    normalizeFirebaseUrl('https://demo-default-rtdb.firebaseio.com/stall_state.json/'),
    'https://demo-default-rtdb.firebaseio.com',
  );
  const snap = normalizeSnapshot({
    settings: { ratePerSlot: 149 },
    laptops: {
      '0': { id: 'l1', code: 'L1', owner: 'Mohit' },
    },
  });
  assert.equal(Array.isArray(snap.laptops), true);
  assert.equal(snap.laptops.length, 1);
  assert.deepEqual(snap.laptops[0].games, []);
  assert.deepEqual(snap.sessions, []);
  assert.deepEqual(snap.payments, []);
  assert.equal(snap.metrics.collectedTotal, 0);
});
