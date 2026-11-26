export const DEFAULT_RATE_PER_SLOT = 149;
export const DEFAULT_SLOT_MINUTES = 30;

export function formatCurrency(amount, symbol = '₹') {
  const num = Number(amount || 0);
  const abs = Math.abs(Math.round(num));
  const formatted = new Intl.NumberFormat('en-IN').format(abs);
  return num < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function formatDurationMMSS(remainingMs) {
  const isOvertime = remainingMs < 0;
  const totalSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return isOvertime ? `+${mm}:${ss}` : `${mm}:${ss}`;
}

export function getTimerPhase(remainingMs) {
  if (remainingMs <= 0) return 'overtime';
  if (remainingMs <= 5 * 60_000) return 'ending';
  return 'running';
}

export function formatClockTime(epochMs) {
  if (!epochMs) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(epochMs));
}

export function computeMetrics(sessions = [], payments = [], settings = {}) {
  const rate = Number(settings?.ratePerSlot || DEFAULT_RATE_PER_SLOT);
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const validSessions = safeSessions.filter((s) => s.status !== 'cancelled');
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

  const validPayments = safePayments.filter((p) => !p.voidedAt);
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

export function computeCrossCheckSummary(metrics, currencySymbol = '₹') {
  const diffAmount = Number(metrics?.diffAmount || 0);
  const diffSlots = Number(metrics?.diffSlots || 0);
  const played = Number(metrics?.totalValidSlotsPlayed || 0);
  const paid = Number(metrics?.paidSlotsCount || 0);

  if (diffAmount === 0 && diffSlots === 0) {
    return {
      status: 'matched',
      badgeText: played === 0 ? 'Ready (0 slots)' : `Matched (${paid}/${played})`,
      detailText: `${paid} paid = ${played} played`,
    };
  }

  if (diffAmount < 0 || diffSlots < 0) {
    const missingSlots = Math.max(0, played - paid);
    return {
      status: 'short',
      badgeText: `${missingSlots} unpaid (${formatCurrency(diffAmount, currencySymbol)})`,
      detailText: `${paid} paid vs ${played} played`,
    };
  }

  const extraSlots = Math.max(0, paid - played);
  return {
    status: 'ahead',
    badgeText: `+${extraSlots} extra (+${formatCurrency(diffAmount, currencySymbol)})`,
    detailText: `${paid} paid vs ${played} played`,
  };
}

export function computeScalingMatrix({
  ratePerSlot = DEFAULT_RATE_PER_SLOT,
  slotMinutes = DEFAULT_SLOT_MINUTES,
  laptopCounts = [5, 6, 7, 8, 10],
  occupancyPct = 100,
  customLaptops = 7,
  customHours = 3,
} = {}) {
  const rate = Math.max(1, Number(ratePerSlot || DEFAULT_RATE_PER_SLOT));
  const mins = Math.max(1, Number(slotMinutes || DEFAULT_SLOT_MINUTES));
  const occ = Math.max(10, Math.min(100, Number(occupancyPct || 100))) / 100;
  const slotsPerHour = 60 / mins;

  const uniqueCounts = [...new Set([...laptopCounts, Number(customLaptops || 7)])]
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 30)
    .toSorted((a, b) => a - b);

  const rows = uniqueCounts.map((count) => {
    const rev30m = Math.round(count * 1 * rate * occ);
    const rev1h = Math.round(count * slotsPerHour * 1 * rate * occ);
    const rev2h = Math.round(count * slotsPerHour * 2 * rate * occ);
    const rev3h = Math.round(count * slotsPerHour * 3 * rate * occ);
    return {
      laptops: count,
      isRealisticTarget: count === Number(customLaptops || 7),
      rev30m,
      rev1h,
      rev2h,
      rev3h,
    };
  });

  const targetLaptops = Math.max(1, Number(customLaptops || 7));
  const targetHours = Math.max(0.5, Number(customHours || 3));
  const totalSlots = Math.round(targetLaptops * slotsPerHour * targetHours);
  const fullRevenue = totalSlots * rate;
  const adjustedRevenue = Math.round(fullRevenue * occ);

  return {
    rows,
    columns: {
      slotMinutes: mins,
      slotsPerHour,
      slots30m: 1,
      slots1h: Number((1 * slotsPerHour).toFixed(1)),
      slots2h: Number((2 * slotsPerHour).toFixed(1)),
      slots3h: Number((3 * slotsPerHour).toFixed(1)),
    },
    summary: {
      laptops: targetLaptops,
      hours: targetHours,
      totalSlots,
      fullRevenue,
      adjustedRevenue,
      occupancyPct: Math.round(occ * 100),
    },
  };
}

export function computeRigBreakdown(laptops = [], sessions = [], settings = {}) {
  const rate = Number(settings?.ratePerSlot || DEFAULT_RATE_PER_SLOT);
  const safeLaptops = Array.isArray(laptops) ? laptops : [];
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const map = new Map();

  for (const rig of safeLaptops) {
    map.set(rig.id, {
      laptopId: rig.id,
      code: rig.code,
      owner: rig.owner,
      active: rig.active !== false,
      sessionsCount: 0,
      slotsPlayed: 0,
      expectedRevenue: 0,
      isRunning: false,
    });
  }

  for (const s of safeSessions) {
    if (s.status === 'cancelled') continue;
    let entry = map.get(s.laptopId);
    if (!entry) {
      entry = {
        laptopId: s.laptopId,
        code: s.laptopCode || '?',
        owner: s.laptopOwner || 'Unknown',
        active: true,
        sessionsCount: 0,
        slotsPlayed: 0,
        expectedRevenue: 0,
        isRunning: false,
      };
      map.set(s.laptopId, entry);
    }
    const blocks = Number(s.blocksCount || 1);
    const sRate = Number(s.ratePerSlot || rate);
    entry.sessionsCount += 1;
    entry.slotsPlayed += blocks;
    entry.expectedRevenue += blocks * sRate;
    if (s.status === 'active') entry.isRunning = true;
  }

  return [...map.values()];
}

export function findMatchingRigs(laptops = [], activeByLaptop = new Map(), query = '') {
  const q = String(query || '').trim().toLowerCase();
  const safeLaptops = Array.isArray(laptops) ? laptops : [];
  const list = safeLaptops.map((rig) => {
    const games = Array.isArray(rig.games) ? rig.games : [];
    const matchingGames = q
      ? games.filter((g) => String(g.title || '').toLowerCase().includes(q))
      : games;
    const metaMatch =
      !q ||
      String(rig.code || '').toLowerCase().includes(q) ||
      String(rig.owner || '').toLowerCase().includes(q) ||
      String(rig.specs || '').toLowerCase().includes(q);
    return {
      rig: { ...rig, games },
      activeSession: activeByLaptop.get(rig.id) || null,
      matchingGames,
      matches: matchingGames.length > 0 || metaMatch,
    };
  });

  return list
    .filter((entry) => entry.matches)
    .toSorted((a, b) => {
      const aBusy = a.activeSession ? 1 : 0;
      const bBusy = b.activeSession ? 1 : 0;
      if (aBusy !== bBusy) return aBusy - bBusy;
      return Number(a.rig.sortOrder || 0) - Number(b.rig.sortOrder || 0);
    });
}

function csvCell(value) {
  let str = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function buildRecordsCsv(sessions = [], payments = []) {
  const headers = [
    'RecordType',
    'RefNumber',
    'TimestampISO',
    'LaptopCode',
    'Owner',
    'PlayerName',
    'GameOrNote',
    'MethodOrStatus',
    'Slots',
    'AmountINR',
    'PaperChecked',
  ];
  const lines = [headers.join(',')];

  for (const s of sessions) {
    lines.push(
      [
        'SESSION',
        `S-${s.slipNo}`,
        new Date(s.startedAt).toISOString(),
        s.laptopCode,
        s.laptopOwner,
        s.playerName,
        s.gameTitle,
        s.status,
        s.blocksCount,
        Number(s.blocksCount || 1) * Number(s.ratePerSlot || 149),
        '',
      ]
        .map(csvCell)
        .join(','),
    );
  }

  for (const p of payments) {
    lines.push(
      [
        'PAYMENT',
        `P-${p.receiptNo}`,
        new Date(p.createdAt).toISOString(),
        p.laptopCode || '',
        '',
        p.playerName || '',
        p.note || '',
        p.voidedAt ? `${p.method.toUpperCase()} (VOID)` : p.method.toUpperCase(),
        p.slots,
        p.voidedAt ? 0 : p.amount,
        p.paperChecked ? 'YES' : 'NO',
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}
