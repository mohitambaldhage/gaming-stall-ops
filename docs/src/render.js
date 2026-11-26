import {
  computeCrossCheckSummary,
  computeRigBreakdown,
  computeScalingMatrix,
  findMatchingRigs,
  formatClockTime,
  formatCurrency,
  formatDurationMMSS,
  getTimerPhase,
} from './domain.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'textContent') node.textContent = String(v);
    else if (k === 'className') node.className = String(v);
    else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) {
        if (dv !== undefined && dv !== null) node.dataset[dk] = String(dv);
      }
    } else if (k === 'checked') node.checked = Boolean(v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function getActiveSessionsMap(sessions = []) {
  const map = new Map();
  for (const s of sessions) {
    if (s.status === 'active' && !map.has(s.laptopId)) {
      map.set(s.laptopId, s);
    }
  }
  return map;
}

export function renderHeaderAndMetrics(state, syncInfo) {
  const { settings, metrics } = state;
  const laptops = Array.isArray(state.laptops) ? state.laptops : [];
  const activeCount = laptops.filter((l) => l.active !== false).length;
  const sym = settings?.currencySymbol || '₹';
  const rate = Number(settings?.ratePerSlot || 149);
  const mins = Number(settings?.slotMinutes || 30);

  document.getElementById('stall-title').textContent = settings?.stallName || 'Nov 28 Gaming Stall';
  document.getElementById('stall-subtitle').textContent =
    `${activeCount} active laptop${activeCount === 1 ? '' : 's'} · ${formatCurrency(rate, sym)} / ${mins} min · No pause`;
  document.getElementById('floor-tab-count').textContent = String(activeCount);

  document.getElementById('metric-collected').textContent = formatCurrency(metrics.collectedTotal, sym);
  document.getElementById('metric-method-split').textContent =
    `${metrics.cashCount} Cash (${formatCurrency(metrics.cashTotal, sym)}) · ${metrics.upiCount} UPI (${formatCurrency(metrics.upiTotal, sym)})`;

  document.getElementById('metric-played').textContent =
    `${metrics.totalValidSlotsPlayed} slot${metrics.totalValidSlotsPlayed === 1 ? '' : 's'}`;
  document.getElementById('metric-expected').textContent =
    `Expected ${formatCurrency(metrics.expectedRevenue, sym)} · ${metrics.activeSessionsCount} active`;

  const cc = computeCrossCheckSummary(metrics, sym);
  const ccBox = document.getElementById('crosscheck-box');
  ccBox.dataset.status = cc.status;
  const statusGlyph = cc.status === 'matched' ? '✓ ' : cc.status === 'short' ? '⚠ ' : '↑ ';
  document.getElementById('metric-crosscheck').textContent = `${statusGlyph}${cc.badgeText}`;
  document.getElementById('metric-crosscheck-detail').textContent = cc.detailText;

  document.getElementById('quick-cash-btn').textContent = `+1 Cash (${formatCurrency(rate, sym)})`;
  document.getElementById('quick-upi-btn').textContent = `+1 UPI (${formatCurrency(rate, sym)})`;

  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-status-label');
  if (syncInfo.backend === 'server') {
    dot.dataset.state = syncInfo.syncStatus === 'connected' ? 'connected' : 'error';
    label.textContent = syncInfo.syncStatus === 'connected' ? 'Live SQLite Sync' : 'Reconnecting';
  } else if (syncInfo.backend === 'firebase') {
    dot.dataset.state = syncInfo.syncStatus === 'connected' ? 'connected' : 'error';
    label.textContent = syncInfo.syncStatus === 'connected' ? 'Live Cloud Sync' : 'Reconnecting';
  } else {
    dot.dataset.state = 'local';
    label.textContent = 'Phone Storage';
  }
}

export function renderFloorGrid(state, nowMs, handlers) {
  const container = document.getElementById('floor-grid');
  const activeMap = getActiveSessionsMap(state.sessions || []);
  const rate = Number(state.settings?.ratePerSlot || 149);
  const mins = Number(state.settings?.slotMinutes || 30);
  const sym = state.settings?.currencySymbol || '₹';

  const visibleRigs = (state.laptops || []).filter(
    (rig) => rig.active !== false || activeMap.has(rig.id),
  );

  if (visibleRigs.length === 0) {
    container.replaceChildren(
      el('div', { className: 'panel-box' }, [
        el('p', { textContent: 'No active laptops on the floor. Add one or re-enable a rig in Games & Rigs.' }),
      ]),
    );
    return;
  }

  const cards = visibleRigs.map((rig) => {
    const active = activeMap.get(rig.id);
    const games = Array.isArray(rig.games) ? rig.games : [];

    if (active) {
      const remaining = active.endsAt - nowMs;
      const phase = getTimerPhase(remaining);
      const phaseLabel =
        phase === 'overtime' ? '! OVERTIME' : phase === 'ending' ? '▲ ENDING SOON' : '▶ RUNNING';
      const blockMins = Number(active.slotMinutes || mins);
      const totalAmt = Number(active.blocksCount || 1) * Number(active.ratePerSlot || rate);

      const extendBtn = el('button', {
        type: 'button',
        className: 'btn btn-primary',
        textContent: `+${blockMins}m (${formatCurrency(active.ratePerSlot || rate, sym)})`,
      });
      extendBtn.addEventListener('click', () => handlers.onOpenExtend(active, rig));

      const endBtn = el('button', {
        type: 'button',
        className: 'btn',
        textContent: 'End Session',
      });
      endBtn.addEventListener('click', () => handlers.onEndSession(active, rig, false));

      const voidBtn = el('button', {
        type: 'button',
        className: 'btn btn-sm',
        textContent: 'Void Mistake',
        'aria-label': `Void accidental start on ${rig.code}`,
      });
      voidBtn.addEventListener('click', () => handlers.onEndSession(active, rig, true));

      return el(
        'article',
        {
          className: 'rig-card',
          dataset: { phase, laptopId: rig.id, sessionId: active.id },
        },
        [
          el('div', { className: 'rig-head' }, [
            el('div', { className: 'rig-title-wrap' }, [
              el('h3', { className: 'rig-name', textContent: `${rig.code} · ${rig.owner}` }),
              el('div', { className: 'rig-specs', textContent: rig.specs }),
            ]),
            el('span', {
              className: 'status-tag',
              dataset: { kind: phase, sessionBadge: active.id },
              textContent: phaseLabel,
            }),
          ]),
          el('div', {
            className: 'timer-readout',
            dataset: { sessionTimer: active.id },
            textContent: formatDurationMMSS(remaining),
          }),
          el('div', {}, [
            el('div', {
              className: 'session-detail-line',
              textContent: `${active.gameTitle} · ${active.playerName} (Player #${active.slipNo})`,
            }),
            el('div', {
              className: 'session-sub-line',
              textContent: `Started ${formatClockTime(active.startedAt)} · Ends ${formatClockTime(active.endsAt)} · ${active.blocksCount} slot(s) (${formatCurrency(totalAmt, sym)})`,
            }),
          ]),
          el('div', { className: 'rig-actions' }, [extendBtn, endBtn, voidBtn]),
        ],
      );
    }

    const readyGames = games.filter((g) => g.installed);
    const pendingCount = games.length - readyGames.length;
    const pills = readyGames.slice(0, 5).map((g) =>
      el('span', { className: 'game-pill', textContent: g.title }),
    );
    if (readyGames.length > 5) {
      pills.push(el('span', { className: 'game-pill', textContent: `+${readyGames.length - 5} more` }));
    }
    if (pendingCount > 0) {
      pills.push(
        el('span', {
          className: 'game-pill',
          dataset: { installed: 'false' },
          textContent: `${pendingCount} to install`,
        }),
      );
    }

    const startBtn = el('button', {
      type: 'button',
      className: 'btn btn-primary',
      textContent: `Start ${mins}m (${formatCurrency(rate, sym)})`,
    });
    startBtn.addEventListener('click', () => handlers.onOpenStart(rig));

    return el(
      'article',
      {
        className: 'rig-card',
        dataset: { phase: 'free', laptopId: rig.id },
      },
      [
        el('div', { className: 'rig-head' }, [
          el('div', { className: 'rig-title-wrap' }, [
            el('h3', { className: 'rig-name', textContent: `${rig.code} · ${rig.owner}` }),
            el('div', { className: 'rig-specs', textContent: rig.specs }),
          ]),
          el('span', {
            className: 'status-tag',
            dataset: { kind: 'free' },
            textContent: '● FREE',
          }),
        ]),
        el('div', { className: 'game-pills' }, pills),
        el('div', { className: 'rig-actions' }, [startBtn]),
      ],
    );
  });

  container.replaceChildren(...cards);
}

export function updateLiveTimers(state, nowMs) {
  for (const session of state.sessions || []) {
    if (session.status !== 'active') continue;
    const remaining = session.endsAt - nowMs;
    const phase = getTimerPhase(remaining);

    const timerEl = document.querySelector(`[data-session-timer="${session.id}"]`);
    if (timerEl) {
      timerEl.textContent = formatDurationMMSS(remaining);
    }

    const cardEl = document.querySelector(`.rig-card[data-session-id="${session.id}"]`);
    if (cardEl && cardEl.dataset.phase !== phase) {
      cardEl.dataset.phase = phase;
    }

    const badgeEl = document.querySelector(`[data-session-badge="${session.id}"]`);
    if (badgeEl && badgeEl.dataset.kind !== phase) {
      badgeEl.dataset.kind = phase;
      badgeEl.textContent =
        phase === 'overtime' ? '! OVERTIME' : phase === 'ending' ? '▲ ENDING SOON' : '▶ RUNNING';
    }
  }
}

export function renderRigsList(state, searchQuery, handlers) {
  const container = document.getElementById('rigs-list');
  const activeMap = getActiveSessionsMap(state.sessions);
  const matches = findMatchingRigs(state.laptops, activeMap, searchQuery);

  if (matches.length === 0) {
    container.replaceChildren(
      el('div', { className: 'panel-box' }, [
        el('p', { textContent: `No laptops or games matched "${searchQuery}".` }),
      ]),
    );
    return;
  }

  const cards = matches.map(({ rig, activeSession }) => {
    const isOffline = rig.active === false && !activeSession;
    const statusText = activeSession
      ? `▶ Busy until ${formatClockTime(activeSession.endsAt)}`
      : isOffline
        ? '○ Offline'
        : '● Free now';
    const statusKind = activeSession ? 'running' : isOffline ? 'ending' : 'free';

    const gamePills = (rig.games || []).map((g) => {
      const btn = el('button', {
        type: 'button',
        className: 'game-pill',
        dataset: { installed: g.installed ? 'true' : 'false' },
        textContent: g.installed ? g.title : `${g.title} (${g.note || 'To install'})`,
        'aria-label': `Toggle install status for ${g.title} on ${rig.code}`,
      });
      btn.addEventListener('click', () => handlers.onToggleGameInstalled(rig, g));
      return btn;
    });

    const addGameBtn = el('button', {
      type: 'button',
      className: 'btn btn-sm',
      textContent: '+ Add Game',
    });
    addGameBtn.addEventListener('click', () => handlers.onOpenAddGame(rig));

    const editRigBtn = el('button', {
      type: 'button',
      className: 'btn btn-sm',
      textContent: 'Edit Rig',
    });
    editRigBtn.addEventListener('click', () => handlers.onOpenEditLaptop(rig));

    const startRigBtn = el('button', {
      type: 'button',
      className: 'btn btn-primary btn-sm',
      textContent: activeSession ? 'In Session' : isOffline ? 'Offline' : 'Start Here',
      disabled: Boolean(activeSession || isOffline),
    });
    if (!activeSession && !isOffline) {
      startRigBtn.addEventListener('click', () => handlers.onOpenStart(rig));
    }

    return el('article', { className: 'rig-card' }, [
      el('div', { className: 'rig-head' }, [
        el('div', { className: 'rig-title-wrap' }, [
          el('h3', {
            className: 'rig-name',
            textContent: `${rig.code} · ${rig.owner} (${rig.ownership})`,
          }),
          el('div', { className: 'rig-specs', textContent: rig.specs }),
          rig.notes ? el('div', { className: 'field-hint', textContent: rig.notes }) : null,
        ]),
        el('span', { className: 'status-tag', dataset: { kind: statusKind }, textContent: statusText }),
      ]),
      el('p', {
        className: 'field-hint',
        textContent: `${(rig.games || []).length} game(s) listed. Tap a game chip to toggle Installed vs Pending.`,
      }),
      el('div', { className: 'game-pills' }, gamePills),
      el('div', { className: 'rig-actions' }, [addGameBtn, editRigBtn, startRigBtn]),
    ]);
  });

  container.replaceChildren(...cards);
}

export function renderPlannerTable(plannerInputs) {
  const { rows, columns, summary } = computeScalingMatrix(plannerInputs);
  const sym = '₹';

  const col30m = document.getElementById('scaling-col-30m');
  const col1h = document.getElementById('scaling-col-1h');
  const col2h = document.getElementById('scaling-col-2h');
  const col3h = document.getElementById('scaling-col-3h');
  if (col30m && columns) {
    col30m.textContent = `${columns.slotMinutes} min (1 slot)`;
    col1h.textContent = `1 hr (${columns.slots1h} slots)`;
    col2h.textContent = `2 hrs (${columns.slots2h} slots)`;
    col3h.textContent = `3 hrs (${columns.slots3h} slots)`;
  }

  document.getElementById('planner-summary').textContent =
    `${summary.laptops} laptops × ${summary.hours} hr(s) = ${summary.totalSlots} slots (${columns?.slotMinutes || 30}m each) -> ` +
    `${formatCurrency(summary.adjustedRevenue, sym)} at ${summary.occupancyPct}% fill` +
    (summary.occupancyPct < 100
      ? ` (Full 100%: ${formatCurrency(summary.fullRevenue, sym)})`
      : '');

  const trs = rows.map((row) =>
    el('tr', { dataset: { highlight: row.isRealisticTarget ? 'true' : 'false' } }, [
      el('th', {
        scope: 'row',
        textContent: row.isRealisticTarget ? `${row.laptops} laptops (Target)` : `${row.laptops} laptops`,
      }),
      el('td', { className: 'num-cell', textContent: formatCurrency(row.rev30m, sym) }),
      el('td', { className: 'num-cell', textContent: formatCurrency(row.rev1h, sym) }),
      el('td', { className: 'num-cell', textContent: formatCurrency(row.rev2h, sym) }),
      el('td', { className: 'num-cell', textContent: formatCurrency(row.rev3h, sym) }),
    ]),
  );

  document.getElementById('scaling-tbody').replaceChildren(...trs);
}

export function renderRigBreakdownTable(state) {
  const tbody = document.getElementById('rig-breakdown-tbody');
  if (!tbody) return;
  const sym = state.settings?.currencySymbol || '₹';
  const rows = computeRigBreakdown(state.laptops || [], state.sessions || [], state.settings || {});

  const trs = rows.map((r) =>
    el('tr', {}, [
      el('th', { scope: 'row', textContent: `${r.code} · ${r.owner}` }),
      el('td', {
        dataset: { label: 'Status' },
        textContent: r.isRunning ? '▶ Running' : r.active ? '● Active' : '○ Offline',
      }),
      el('td', { className: 'num-cell', dataset: { label: 'Sessions' }, textContent: String(r.sessionsCount) }),
      el('td', { className: 'num-cell', dataset: { label: 'Slots Played' }, textContent: String(r.slotsPlayed) }),
      el('td', { className: 'num-cell', dataset: { label: 'Expected Revenue' }, textContent: formatCurrency(r.expectedRevenue, sym) }),
    ]),
  );
  tbody.replaceChildren(...trs);
}

export function renderPaymentsTable(state, filterVal, handlers) {
  const tbody = document.getElementById('payments-tbody');
  const sym = state.settings?.currencySymbol || '₹';

  const filtered = (state.payments || []).filter((p) => {
    if (filterVal === 'cash') return p.method === 'cash' && !p.voidedAt;
    if (filterVal === 'upi') return p.method === 'upi' && !p.voidedAt;
    if (filterVal === 'unchecked') return !p.paperChecked && !p.voidedAt;
    return true;
  });

  if (filtered.length === 0) {
    tbody.replaceChildren(
      el('tr', {}, [
        el('td', { colspan: '7', textContent: 'No payments logged yet. Tap +1 Cash or +1 UPI above.' }),
      ]),
    );
    return;
  }

  const rows = filtered.map((p) => {
    const checkInput = el('input', {
      type: 'checkbox',
      checked: p.paperChecked,
      disabled: Boolean(p.voidedAt),
      'aria-label': `Mark slip P-${p.receiptNo} checked on paper`,
    });
    checkInput.addEventListener('change', () => handlers.onTogglePaperCheck(p));

    const paperLabel = el('label', { style: 'gap:0.35rem; cursor:pointer;' }, [
      checkInput,
      el('span', { textContent: p.paperChecked ? 'Ticked' : 'Check' }),
    ]);

    const voidBtn = el('button', {
      type: 'button',
      className: 'btn btn-sm',
      textContent: p.voidedAt ? 'Voided' : 'Void',
      disabled: Boolean(p.voidedAt),
    });
    if (!p.voidedAt) {
      voidBtn.addEventListener('click', () => handlers.onVoidPayment(p));
    }

    const noteParts = [p.laptopCode, p.playerName, p.note].filter(Boolean).join(' · ') || 'Walk-in +1';

    return el('tr', { dataset: { voided: p.voidedAt ? 'true' : 'false' } }, [
      el('th', {
        scope: 'row',
        className: 'num-cell',
        dataset: { value: p.receiptNo },
        textContent: `P-${p.receiptNo}`,
      }),
      el('td', {
        className: 'num-cell',
        dataset: { value: p.createdAt, label: 'Time' },
        textContent: formatClockTime(p.createdAt),
      }),
      el('td', {
        dataset: { value: p.method, label: 'Method' },
        textContent: p.method === 'upi' ? 'UPI' : 'Cash',
      }),
      el('td', {
        className: 'num-cell',
        dataset: { value: p.voidedAt ? 0 : p.amount, label: 'Amount' },
        textContent: p.voidedAt ? '₹0 (Void)' : formatCurrency(p.amount, sym),
      }),
      el('td', { dataset: { label: 'Laptop / Note' }, textContent: noteParts }),
      el('td', { dataset: { label: 'Paper' } }, [paperLabel]),
      el('td', { className: 'no-print', dataset: { label: 'Action' } }, [voidBtn]),
    ]);
  });

  tbody.replaceChildren(...rows);
}

export function renderSessionsTable(state) {
  const tbody = document.getElementById('sessions-tbody');
  const sym = state.settings?.currencySymbol || '₹';
  const sessions = state.sessions || [];

  if (sessions.length === 0) {
    tbody.replaceChildren(
      el('tr', {}, [
        el('td', { colspan: '7', textContent: 'No player sessions started yet.' }),
      ]),
    );
    return;
  }

  const rows = sessions.map((s) => {
    const expected = s.status === 'cancelled'
      ? 0
      : Number(s.blocksCount || 1) * Number(s.ratePerSlot || 149);

    return el('tr', { dataset: { voided: s.status === 'cancelled' ? 'true' : 'false' } }, [
      el('th', {
        scope: 'row',
        className: 'num-cell',
        dataset: { value: s.slipNo },
        textContent: `#${s.slipNo}`,
      }),
      el('td', {
        className: 'num-cell',
        dataset: { value: s.startedAt, label: 'Started' },
        textContent: formatClockTime(s.startedAt),
      }),
      el('td', {
        dataset: { value: s.laptopCode, label: 'Laptop' },
        textContent: `${s.laptopCode} · ${s.laptopOwner}`,
      }),
      el('td', {
        dataset: { value: s.gameTitle, label: 'Game' },
        textContent: `${s.gameTitle} (${s.playerName})`,
      }),
      el('td', {
        className: 'num-cell',
        dataset: { value: s.blocksCount, label: 'Slots' },
        textContent: `${s.blocksCount} (${s.blocksCount * s.slotMinutes}m)`,
      }),
      el('td', {
        className: 'num-cell',
        dataset: { value: expected, label: 'Expected' },
        textContent: formatCurrency(expected, sym),
      }),
      el('td', { dataset: { label: 'Status' }, textContent: s.status }),
    ]);
  });

  tbody.replaceChildren(...rows);
}

export function renderSyncPanel(state, syncInfo, syncConfig, store, onToast) {
  const errBanner = document.getElementById('sync-error-banner');
  if (errBanner) {
    if (syncInfo.lastError) {
      errBanner.hidden = false;
      errBanner.textContent = syncInfo.lastError;
    } else {
      errBanner.hidden = true;
      errBanner.textContent = '';
    }
  }

  const desc = document.getElementById('sync-mode-desc');
  if (syncInfo.backend === 'server') {
    desc.textContent =
      `Connected to live SQLite server (${state.meta?.dataDir || 'local DB'}). All laptops and phones share instant updates.`;
  } else if (syncInfo.backend === 'firebase') {
    desc.textContent =
      `Connected to Firebase Realtime DB (${syncConfig.firebaseUrl}). Works from github.io over any Wi-Fi or 5G.`;
  } else {
    desc.textContent =
      'Running in Phone/Browser Local Mode (IndexedDB). Saves permanently on this device. Add a Tunnel URL or Firebase RTDB URL to share live across phones & laptops.';
  }

  const urls = state.meta?.networkUrls?.length ? state.meta.networkUrls : [location.href];
  const preferredPhoneUrl =
    urls.find((u) => !u.includes('localhost') && !u.includes('127.0.0.1')) || urls[0];

  const qrContainer = document.getElementById('qr-container');
  const qrSrc = store.getQrUrl(preferredPhoneUrl);
  if (qrSrc) {
    qrContainer.replaceChildren(
      el('div', { className: 'qr-frame' }, [
        el('img', {
          src: qrSrc,
          width: '200',
          height: '200',
          alt: `QR code to open ${preferredPhoneUrl} on phone`,
        }),
      ]),
    );
  } else {
    qrContainer.replaceChildren();
  }

  const listItems = urls.map((u) => {
    const copyBtn = el('button', { type: 'button', className: 'btn btn-sm', textContent: 'Copy' });
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(u);
        onToast(`Copied ${u}`);
      } catch {
        onToast(u);
      }
    });
    return el('li', { className: 'url-item' }, [el('code', { textContent: u }), copyBtn]);
  });
  document.getElementById('network-url-list').replaceChildren(...listItems);

  const activeEl = document.activeElement;
  if (!activeEl || !activeEl.closest('#sync-config-form')) {
    document.getElementById('sync-mode-select').value = syncConfig.mode;
    document.getElementById('sync-server-url').value = syncConfig.serverUrl;
    document.getElementById('sync-firebase-url').value = syncConfig.firebaseUrl;
  }

  if (!activeEl || !activeEl.closest('#settings-form')) {
    document.getElementById('setting-stall-name').value = state.settings?.stallName || '';
    document.getElementById('setting-rate').value = String(state.settings?.ratePerSlot || 149);
    document.getElementById('setting-mins').value = String(state.settings?.slotMinutes || 30);
  }
}
