import { ChimeController } from './audio.js';
import { buildRecordsCsv, formatCurrency } from './domain.js';
import {
  renderFloorGrid,
  renderHeaderAndMetrics,
  renderPaymentsTable,
  renderPlannerTable,
  renderRigBreakdownTable,
  renderRigsList,
  renderSessionsTable,
  renderSyncPanel,
  updateLiveTimers,
} from './render.js';
import { getSavedPin, loadSyncConfig, savePin, saveSyncConfig, StallStore } from './storage.js';

const store = new StallStore();
const chime = new ChimeController();
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

let activeTab = 'floor';
let gameSearchQuery = '';
let paymentFilter = 'all';
let currentState = null;
let currentSyncInfo = { backend: 'local', syncStatus: 'local' };

// ---------- Accessible Live Announcements & Manual Popover Toasts ----------
function announce(text) {
  const region = document.getElementById('live-announcer');
  if (typeof document.ariaNotify === 'function') {
    document.ariaNotify(text);
    return;
  }
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = text;
  });
}

function showToast(message) {
  const stack = document.getElementById('toast-stack');
  // Suppress overlapping background toasts while a modal dialog is open
  if (document.querySelector('dialog[open]')) {
    announce(message);
    return;
  }

  for (const prev of stack.querySelectorAll('.toast-item')) {
    try {
      prev.hidePopover?.();
    } catch {}
    prev.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.setAttribute('popover', 'manual');

  const span = document.createElement('span');
  span.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-sm';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    try {
      toast.hidePopover?.();
    } catch {}
    toast.remove();
  });

  toast.append(span, closeBtn);
  stack.appendChild(toast);
  try {
    toast.showPopover?.();
  } catch {}
  announce(message);

  let timer = null;
  const scheduleDismiss = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (toast.contains(document.activeElement)) {
        scheduleDismiss();
        return;
      }
      try {
        toast.hidePopover?.();
      } catch {}
      toast.remove();
    }, 3500);
  };
  scheduleDismiss();
}

// ---------- Modern Web Guidance: Dark Mode Two-State Toggle ----------
function getSystemScheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getEffectiveScheme() {
  try {
    const stored = localStorage.getItem('color-scheme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return getSystemScheme();
}

function applySchemeMeta(storedValue) {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.content = storedValue === 'light' || storedValue === 'dark' ? storedValue : 'light dark';
  }
  updateThemeButtonLabel();
}

function updateThemeButtonLabel() {
  const effective = getEffectiveScheme();
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  const btn = document.getElementById('theme-toggle-btn');
  if (effective === 'dark') {
    icon.textContent = '☀';
    label.textContent = 'Day Mode';
    btn.setAttribute('aria-label', 'Switch to light mode');
  } else {
    icon.textContent = '🌙';
    label.textContent = 'Night Mode';
    btn.setAttribute('aria-label', 'Switch to dark mode');
  }
}

function initThemeToggle() {
  updateThemeButtonLabel();
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const currentRendered = getEffectiveScheme();
    const target = currentRendered === 'dark' ? 'light' : 'dark';
    const system = getSystemScheme();
    try {
      if (target === system) {
        localStorage.removeItem('color-scheme');
        applySchemeMeta(null);
      } else {
        localStorage.setItem('color-scheme', target);
        applySchemeMeta(target);
      }
    } catch {
      applySchemeMeta(target);
    }
  });

  window.addEventListener('storage', (e) => {
    if (e.key === 'color-scheme') {
      applySchemeMeta(e.newValue);
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    updateThemeButtonLabel();
  });
}

// ---------- Sound Toggle ----------
function updateSoundButton() {
  const muted = chime.isMuted();
  const btn = document.getElementById('sound-toggle-btn');
  btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  document.getElementById('sound-icon').textContent = muted ? '🔇' : '🔔';
  document.getElementById('sound-label').textContent = muted ? 'Muted' : 'Chime On';
}

// ---------- Native <dialog> Helpers ----------
function setupDialogCloseBehavior() {
  for (const dialog of document.querySelectorAll('dialog')) {
    if (dialog.id === 'confirm-dialog') continue;
    dialog.addEventListener('close', () => {
      queueMicrotask(() => {
        dialog.returnValue = '';
      });
    });
  }

  for (const btn of document.querySelectorAll('[data-close-dialog]')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-dialog');
      document.getElementById(id)?.close('cancel');
    });
  }

  // Fallback light-dismiss for Safari / older browsers without closedBy
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const isOutside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutside(e, dialog)) dialog.close('dismiss');
      });
    }
  }
}

function confirmAction(title, message, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-dialog-title').textContent = title;
    document.getElementById('confirm-dialog-message').textContent = message;
    document.getElementById('confirm-dialog-ok').textContent = okLabel;
    dialog.returnValue = '';

    const onClose = () => {
      const accepted = dialog.returnValue === 'confirm';
      dialog.returnValue = '';
      dialog.removeEventListener('close', onClose);
      resolve(accepted);
    };
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

// ---------- Sortable Table Setup ----------
function applyActiveTableSort(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.tBodies[0];
  const th = table.tHead?.querySelector('th[aria-sort]');
  if (!th || !tbody) return;

  const rows = [...tbody.rows];
  if (rows.length <= 1 && rows[0]?.cells.length === 1) return;

  const colIndex = th.cellIndex;
  const type = th.dataset.type || 'text';
  const dir = th.getAttribute('aria-sort') === 'ascending' ? 1 : -1;
  const getVal = (row) => {
    const cell = row.cells[colIndex];
    return cell?.dataset.value ?? cell?.textContent.trim() ?? '';
  };

  const sorted = rows.toSorted((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    if (type === 'number') {
      return dir * (Number(va) - Number(vb));
    }
    return dir * collator.compare(va, vb);
  });

  for (const row of sorted) {
    if (typeof tbody.moveBefore === 'function') tbody.moveBefore(row, null);
    else tbody.appendChild(row);
  }
}

function setupSortableTable(tableId) {
  const table = document.getElementById(tableId);

  function sortByButton(button) {
    const th = button.closest('th');
    const nextDir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';

    for (const header of table.tHead.rows[0].cells) {
      header.removeAttribute('aria-sort');
    }
    th.setAttribute('aria-sort', nextDir);

    applyActiveTableSort(tableId);
    announce(`Sorted by ${button.textContent.trim()}, ${nextDir}`);
  }

  for (const btn of table.tHead.querySelectorAll('button.sort-btn')) {
    btn.addEventListener('click', () => sortByButton(btn));
  }
}

// ---------- Tab Switching ----------
function selectTab(nextTab) {
  activeTab = nextTab;
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  for (const tab of tabs) {
    const selected = tab.dataset.tab === nextTab;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
    if (selected) {
      try {
        tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest', container: 'nearest' });
      } catch {
        tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    }
  }
  for (const panel of document.querySelectorAll('[role="tabpanel"]')) {
    panel.hidden = panel.id !== `panel-${nextTab}`;
  }
  renderActiveView();
}

function initTabs() {
  const tablist = document.querySelector('[role="tablist"]');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  }

  tablist.addEventListener('keydown', (e) => {
    const idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;
    else return;

    e.preventDefault();
    tabs[nextIdx].focus();
    selectTab(tabs[nextIdx].dataset.tab);
  });
}

// ---------- Planner Calculation ----------
function refreshPlanner() {
  const rate = Number(document.getElementById('plan-rate').value || 149);
  const laptops = Number(document.getElementById('plan-laptops').value || 7);
  const hours = Number(document.getElementById('plan-hours').value || 3);
  const occupancyPct = Number(document.getElementById('plan-occupancy').value || 100);
  renderPlannerTable({
    ratePerSlot: rate,
    slotMinutes: Number(currentState?.settings?.slotMinutes || 30),
    customLaptops: laptops,
    customHours: hours,
    occupancyPct,
  });
}

// ---------- Action Handlers ----------
async function safeAction(fn, announceMsg, { toast = false, submitter = null } = {}) {
  if (submitter) submitter.disabled = true;
  try {
    await fn();
    if (announceMsg) {
      if (toast) showToast(announceMsg);
      else announce(announceMsg);
    }
  } catch (err) {
    if (err?.pinRequired) {
      selectTab('sync');
      showToast('Enter Operator PIN in Sync & QR settings first.');
      return;
    }
    showToast(err?.message || 'Action failed');
  } finally {
    if (submitter) submitter.disabled = false;
  }
}

function renderEditLaptopGames(rig) {
  const list = document.getElementById('edit-laptop-games-list');
  if (!list) return;
  const games = Array.isArray(rig.games) ? rig.games : [];
  if (games.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'field-hint';
    empty.textContent = 'No games listed.';
    list.replaceChildren(empty);
    return;
  }
  const buttons = games.map((g) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-pill';
    btn.textContent = `${g.title} ✕`;
    btn.setAttribute('aria-label', `Remove ${g.title} from ${rig.code}`);
    btn.addEventListener('click', async () => {
      await safeAction(async () => {
        const updatedSnap = await store.removeGameFromLaptop(rig.id, g.id);
        const latestRig = (updatedSnap.laptops || []).find((l) => l.id === rig.id);
        if (latestRig) renderEditLaptopGames(latestRig);
      }, `Removed ${g.title} from ${rig.code}`);
    });
    return btn;
  });
  list.replaceChildren(...buttons);
}

const uiHandlers = {
  onOpenStart(rig) {
    const dialog = document.getElementById('start-session-dialog');
    const form = document.getElementById('start-session-form');
    form.reset();

    const mins = Number(currentState?.settings?.slotMinutes || 30);
    const rate = currentState?.settings?.ratePerSlot || 149;
    const sym = currentState?.settings?.currencySymbol || '₹';

    document.getElementById('start-dialog-title').textContent = `Start ${mins}-Min Session`;
    document.getElementById('start-session-notice').textContent =
      `${mins}:00 timer starts immediately. No pause rule applies.`;
    document.getElementById('start-session-submit').textContent = `Start ${mins}:00 Timer`;

    document.getElementById('start-laptop-id').value = rig.id;
    document.getElementById('start-laptop-label').textContent = `${rig.code} (${rig.owner})`;
    const customInput = document.getElementById('start-game-custom');
    const playerInput = document.getElementById('start-player-name');
    const games = Array.isArray(rig.games) ? rig.games : [];
    customInput.value = games.find((g) => g.installed)?.title || games[0]?.title || '';
    playerInput.value = '';

    const chipsContainer = document.getElementById('start-game-chips');
    const chips = games.map((g) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pick-chip';
      chip.dataset.title = g.title;
      chip.textContent = g.installed ? g.title : `${g.title} (pending)`;
      chip.setAttribute('aria-pressed', g.title === customInput.value ? 'true' : 'false');
      chip.addEventListener('click', () => {
        customInput.value = g.title;
        for (const c of chipsContainer.querySelectorAll('.pick-chip')) {
          c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
        }
      });
      return chip;
    });
    chipsContainer.replaceChildren(...chips);

    const labels = dialog.querySelectorAll('.radio-card span');
    if (labels[0]) labels[0].textContent = `Cash ${formatCurrency(rate, sym)}`;
    if (labels[1]) labels[1].textContent = `UPI ${formatCurrency(rate, sym)}`;

    dialog.showModal();
  },

  onOpenExtend(session, rig) {
    const dialog = document.getElementById('extend-session-dialog');
    const form = document.getElementById('extend-session-form');
    form.reset();

    const mins = Number(session.slotMinutes || currentState?.settings?.slotMinutes || 30);
    const rate = session.ratePerSlot || 149;
    const sym = currentState?.settings?.currencySymbol || '₹';

    document.getElementById('extend-dialog-title').textContent = `Add +${mins} Min Block`;
    document.getElementById('extend-pay-label').textContent = `Payment for +${mins} min`;
    document.getElementById('extend-session-submit').textContent = `Add +${mins}m`;
    document.getElementById('extend-session-id').value = session.id;
    document.getElementById('extend-session-summary').textContent =
      `${rig.code} · ${rig.owner} playing ${session.gameTitle} (${session.playerName})`;
    const labels = dialog.querySelectorAll('.radio-card span');
    if (labels[0]) labels[0].textContent = `Cash ${formatCurrency(rate, sym)}`;
    if (labels[1]) labels[1].textContent = `UPI ${formatCurrency(rate, sym)}`;
    dialog.showModal();
  },

  onOpenEditLaptop(rig) {
    document.getElementById('edit-laptop-id').value = rig.id;
    document.getElementById('edit-laptop-code').value = rig.code || '';
    document.getElementById('edit-laptop-owner').value = rig.owner || '';
    document.getElementById('edit-laptop-ownership').value = rig.ownership || 'Friend';
    document.getElementById('edit-laptop-specs').value = rig.specs || '';
    document.getElementById('edit-laptop-notes').value = rig.notes || '';
    document.getElementById('edit-laptop-active').checked = rig.active !== false;
    renderEditLaptopGames(rig);
    document.getElementById('edit-laptop-dialog').showModal();
  },

  async onEndSession(session, rig, isVoidMistake) {
    const title = isVoidMistake ? 'Void Accidental Session?' : `End ${rig.code} Session?`;
    const msg = isVoidMistake
      ? `Void Player #${session.slipNo} (${session.gameTitle}) on ${rig.code}? It will not count in slots played.`
      : `Finish ${session.playerName}'s session (${session.gameTitle}) on ${rig.code}?`;
    const ok = await confirmAction(title, msg, isVoidMistake ? 'Void Session' : 'End Session');
    if (!ok) return;
    await safeAction(
      () => store.endSession(session.id, { cancel: isVoidMistake }),
      isVoidMistake ? `Voided ${rig.code} mistake` : `Ended ${rig.code} session`,
    );
  },

  async onToggleGameInstalled(rig, game) {
    await safeAction(
      () => store.toggleGameInstalled(rig.id, game.id),
      `${rig.code}: ${game.title} marked ${game.installed ? 'Pending' : 'Installed'}`,
    );
  },

  onOpenAddGame(rig) {
    document.getElementById('add-game-laptop-id').value = rig.id;
    document.getElementById('add-game-laptop-name').textContent = `${rig.code} · ${rig.owner}`;
    document.getElementById('new-game-title').value = '';
    document.getElementById('new-game-installed').checked = true;
    document.getElementById('add-game-dialog').showModal();
  },

  async onTogglePaperCheck(payment) {
    await safeAction(() => store.togglePaymentPaperChecked(payment.id));
  },

  async onVoidPayment(payment) {
    const ok = await confirmAction(
      `Void Slip P-${payment.receiptNo}?`,
      `Remove ${payment.method.toUpperCase()} ₹${payment.amount} from totals?`,
      'Void Payment',
    );
    if (!ok) return;
    await safeAction(() => store.voidPayment(payment.id), `Voided P-${payment.receiptNo}`);
  },
};

function renderActiveView() {
  if (!currentState) return;
  const nowMs = store.nowMs();
  renderHeaderAndMetrics(currentState, currentSyncInfo);

  if (activeTab === 'floor') {
    renderFloorGrid(currentState, nowMs, uiHandlers);
  } else if (activeTab === 'rigs') {
    renderRigsList(currentState, gameSearchQuery, uiHandlers);
  } else if (activeTab === 'records') {
    refreshPlanner();
    renderRigBreakdownTable(currentState);
    renderPaymentsTable(currentState, paymentFilter, uiHandlers);
    applyActiveTableSort('payments-table');
    renderSessionsTable(currentState);
    applyActiveTableSort('sessions-table');
  } else if (activeTab === 'sync') {
    renderSyncPanel(currentState, currentSyncInfo, loadSyncConfig(), store, showToast);
  }
}

// ---------- Wire All Form & Button Events ----------
function wireInteractions() {
  const unlockAudio = () => chime.unlock();
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  document.getElementById('sound-toggle-btn').addEventListener('click', () => {
    chime.setMuted(!chime.isMuted());
    updateSoundButton();
    showToast(chime.isMuted() ? 'Overtime chime muted' : 'Overtime chime active');
  });

  document.getElementById('test-chime-btn').addEventListener('click', () => {
    chime.playOvertimeChime({ force: true });
    showToast('Chime tested');
  });

  document.getElementById('sync-status-btn').addEventListener('click', () => selectTab('sync'));

  // Quick +1 Cash / UPI / Undo
  document.getElementById('quick-cash-btn').addEventListener('click', () =>
    safeAction(() => store.recordPayment({ method: 'cash', slots: 1 }), '+1 Cash recorded'),
  );
  document.getElementById('quick-upi-btn').addEventListener('click', () =>
    safeAction(() => store.recordPayment({ method: 'upi', slots: 1 }), '+1 UPI recorded'),
  );
  document.getElementById('quick-undo-btn').addEventListener('click', async () => {
    const latest = currentState?.payments?.find((p) => !p.voidedAt);
    if (!latest) {
      showToast('No payment to undo');
      return;
    }
    const ok = await confirmAction(
      `Undo P-${latest.receiptNo}?`,
      `Void last ${latest.method.toUpperCase()} payment of ₹${latest.amount}?`,
      'Undo Payment',
    );
    if (!ok) return;
    await safeAction(() => store.voidPayment(latest.id), `Undid P-${latest.receiptNo}`);
  });

  // Sync custom game text input back to pick-chip pressed state
  document.getElementById('start-game-custom').addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    for (const c of document.querySelectorAll('#start-game-chips .pick-chip')) {
      const match = (c.dataset.title || '').toLowerCase() === val;
      c.setAttribute('aria-pressed', match ? 'true' : 'false');
    }
  });

  // Start Session Form
  document.getElementById('start-session-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const laptopId = document.getElementById('start-laptop-id').value;
    const gameTitle = document.getElementById('start-game-custom').value.trim();
    const playerName = document.getElementById('start-player-name').value.trim();
    const paymentMethod =
      document.querySelector('input[name="start-pay"]:checked')?.value || 'unpaid';
    await safeAction(
      async () => {
        await store.startSession({ laptopId, gameTitle, playerName, paymentMethod });
        document.getElementById('start-session-dialog').close('submitted');
      },
      `Started timer on ${gameTitle}`,
      { submitter: e.submitter },
    );
  });

  // Extend Block Form
  document.getElementById('extend-session-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sessionId = document.getElementById('extend-session-id').value;
    const paymentMethod =
      document.querySelector('input[name="extend-pay"]:checked')?.value || 'cash';
    await safeAction(
      async () => {
        await store.extendSession(sessionId, { paymentMethod, blocks: 1 });
        document.getElementById('extend-session-dialog').close('submitted');
      },
      'Extra block added',
      { submitter: e.submitter },
    );
  });

  // Add Laptop triggers & form
  for (const btnId of ['floor-add-laptop-btn', 'rigs-add-laptop-btn']) {
    document.getElementById(btnId).addEventListener('click', () => {
      document.getElementById('add-laptop-form').reset();
      document.getElementById('add-laptop-dialog').showModal();
    });
  }

  document.getElementById('add-laptop-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('new-laptop-code').value.trim();
    const owner = document.getElementById('new-laptop-owner').value.trim();
    const ownership = document.getElementById('new-laptop-ownership').value;
    const specs = document.getElementById('new-laptop-specs').value.trim();
    const gamesRaw = document.getElementById('new-laptop-games').value;
    const games = gamesRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((title) => ({ title, installed: true }));

    await safeAction(
      async () => {
        await store.addLaptop({ code, owner, ownership, specs, games });
        document.getElementById('add-laptop-dialog').close('submitted');
      },
      `Added laptop ${owner}`,
      { submitter: e.submitter },
    );
  });

  // Edit Laptop Form
  document.getElementById('edit-laptop-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-laptop-id').value;
    const code = document.getElementById('edit-laptop-code').value.trim();
    const owner = document.getElementById('edit-laptop-owner').value.trim();
    const ownership = document.getElementById('edit-laptop-ownership').value;
    const specs = document.getElementById('edit-laptop-specs').value.trim();
    const notes = document.getElementById('edit-laptop-notes').value.trim();
    const active = document.getElementById('edit-laptop-active').checked;

    await safeAction(
      async () => {
        await store.updateLaptop(id, { code, owner, ownership, specs, notes, active });
        document.getElementById('edit-laptop-dialog').close('submitted');
      },
      `Updated ${code || owner}`,
      { submitter: e.submitter },
    );
  });

  // Add Game Form
  document.getElementById('add-game-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const laptopId = document.getElementById('add-game-laptop-id').value;
    const title = document.getElementById('new-game-title').value.trim();
    const installed = document.getElementById('new-game-installed').checked;
    await safeAction(
      async () => {
        await store.addGameToLaptop(laptopId, { title, installed });
        document.getElementById('add-game-dialog').close('submitted');
      },
      `Added ${title}`,
      { submitter: e.submitter },
    );
  });

  // Game Search
  document.getElementById('game-search-input').addEventListener('input', (e) => {
    gameSearchQuery = e.target.value;
    if (currentState) renderRigsList(currentState, gameSearchQuery, uiHandlers);
  });
  document.getElementById('clear-search-btn').addEventListener('click', () => {
    gameSearchQuery = '';
    document.getElementById('game-search-input').value = '';
    if (currentState) renderRigsList(currentState, '', uiHandlers);
  });

  // Planner Controls
  for (const id of ['plan-laptops', 'plan-hours', 'plan-rate', 'plan-occupancy']) {
    document.getElementById(id).addEventListener('input', refreshPlanner);
  }

  // Payment Filter, Export CSV, Print
  document.getElementById('payment-filter-select').addEventListener('change', (e) => {
    paymentFilter = e.target.value;
    if (currentState) {
      renderPaymentsTable(currentState, paymentFilter, uiHandlers);
      applyActiveTableSort('payments-table');
    }
  });

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    if (!currentState) return;
    const csv = buildRecordsCsv(currentState.sessions, currentState.payments);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stall-records-${currentState.settings?.eventDate || 'nov28'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  });

  document.getElementById('print-records-btn').addEventListener('click', () => window.print());

  // AI Shift Analyst (Google Antigravity SDK)
  document.getElementById('run-ai-brief-btn').addEventListener('click', async () => {
    const out = document.getElementById('ai-brief-output');
    const question = document.getElementById('ai-question-input').value.trim();
    out.hidden = false;
    out.textContent = 'Running Antigravity SDK analyst...';
    try {
      const result = await store.requestAiBrief(question);
      if (result.summary) {
        out.textContent = result.summary;
      } else if (result.answer) {
        out.textContent = result.answer;
      } else if (result.deterministic_brief) {
        out.textContent = `${result.message}\n\n${result.deterministic_brief}`;
      } else {
        out.textContent = result.message || JSON.stringify(result, null, 2);
      }
    } catch (err) {
      out.textContent = err?.message || 'Could not reach AI analyst endpoint.';
    }
  });

  // Sync Config Form
  document.getElementById('sync-pin-input').value = getSavedPin();
  document.getElementById('sync-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    saveSyncConfig({
      mode: document.getElementById('sync-mode-select').value,
      serverUrl: document.getElementById('sync-server-url').value,
      firebaseUrl: document.getElementById('sync-firebase-url').value,
    });
    savePin(document.getElementById('sync-pin-input').value);
    await store.init();
    if (currentSyncInfo.lastError) {
      showToast(currentSyncInfo.lastError);
    } else {
      showToast(`Sync connected: ${currentSyncInfo.backend}`);
    }
  });

  // Settings Form
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await safeAction(
      () =>
        store.updateSettings({
          stallName: document.getElementById('setting-stall-name').value,
          ratePerSlot: Number(document.getElementById('setting-rate').value),
          slotMinutes: Number(document.getElementById('setting-mins').value),
        }),
      'Settings saved',
    );
  });

  // JSON Backup / Restore / Reset Day
  document.getElementById('export-json-btn').addEventListener('click', () => {
    if (!currentState) return;
    const blob = new Blob([JSON.stringify(currentState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gaming-stall-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON backup downloaded');
  });

  document.getElementById('import-json-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await store.importSnapshot(parsed);
      showToast('Backup restored');
    } catch (err) {
      showToast(err?.message || 'Could not restore JSON');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('reset-day-btn').addEventListener('click', async () => {
    const ok = await confirmAction(
      'Reset Test Sessions & Payments?',
      'This deletes all recorded sessions and payments so you start fresh for Nov 28. All 7 laptops and games stay intact.',
      'Reset Sessions & Payments',
    );
    if (!ok) return;
    await safeAction(() => store.resetDay(), 'Sessions & payments cleared');
  });
}

// ---------- Boot ----------
async function boot() {
  initThemeToggle();
  updateSoundButton();
  setupDialogCloseBehavior();
  initTabs();
  setupSortableTable('payments-table');
  setupSortableTable('sessions-table');
  wireInteractions();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  let initializedOvertime = false;
  store.onUpdate((state, syncInfo) => {
    currentState = state;
    currentSyncInfo = syncInfo;
    if (!initializedOvertime) {
      chime.seedInitialOvertime(state.sessions || [], store.nowMs());
      initializedOvertime = true;
    }
    renderActiveView();
  });

  await store.init();

  setInterval(() => {
    if (!currentState) return;
    const nowMs = store.nowMs();
    if (activeTab === 'floor') {
      updateLiveTimers(currentState, nowMs);
    }
    chime.checkSessions(currentState.sessions || [], nowMs, (session) => {
      showToast(`Time up: ${session.laptopCode} (${session.gameTitle})`);
    });
  }, 1000);
}

boot();
