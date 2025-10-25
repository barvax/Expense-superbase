// kids.js — ניהול תקציב ילדים: ילדים, תנועות, יומן, מחיקות עם אישור
// מותאם ל-IDs שלך ול-Option A (views: kids, kid_transactions, v_kid_balance)

function waitForSb() {
  return new Promise((resolve) => {
    if (window.sb) return resolve(window.sb);
    const onReady = () => { window.removeEventListener("sb-ready", onReady); resolve(window.sb); };
    window.addEventListener("sb-ready", onReady);
  });
}

const ILS = new Intl.NumberFormat('he-IL', { style:'currency', currency:'ILS', maximumFractionDigits:0 });
const toILS = (c) => ILS.format(Math.round((c||0)/100));
const cents = (n) => Math.max(0, Math.round((Number(n)||0) * 100));

/* ---------- אלמנטים ---------- */
const els = {
  // ניווט למסך
  openKidsBtn: document.getElementById('openKidsBtn'),
  kidsView:    document.getElementById('view-kids'),
  kidsBackBtn: document.getElementById('kidsBackBtn'),

  // רשימת ילדים
  kidsList:    document.getElementById('kidsList'),

  // יומן
  kidsLogWrap:  document.getElementById('kidsLogWrap'),
  kidsLogTitle: document.getElementById('kidsLogTitle'),
  kidsLog:      document.getElementById('kidsLog'),
  closeKidsLog: document.getElementById('closeKidsLog'),

  // הוספת ילד
  addKidBtn:    document.getElementById('addKidBtn'),
  addKidDialog: document.getElementById('addKidDialog'),
  closeAddKid:  document.getElementById('closeAddKid'),
  addKidForm:   document.getElementById('addKidForm'),
  kidName:      document.getElementById('kidName'),
  addKidErr:    document.getElementById('addKidErr'),

  // תנועה לילד (הוספה/הורדה)
  kidEntryDialog:  document.getElementById('kidEntryDialog'),
  closeKidEntry:   document.getElementById('closeKidEntry'),
  kidEntryForm:    document.getElementById('kidEntryForm'),
  kidEntryChildId: document.getElementById('kidEntryChildId'),
  kidEntryType:    document.getElementById('kidEntryType'), // add | sub
  kidAmount:       document.getElementById('kidAmount'),
  kidDate:         document.getElementById('kidDate'),
  kidNote:         document.getElementById('kidNote'),
  kidEntryErr:     document.getElementById('kidEntryErr'),

  // מחיקת ילד
  confirmKidDialog: document.getElementById('confirmKidDialog'),
  confirmKidNo:     document.getElementById('confirmKidNo'),
  confirmKidYes:    document.getElementById('confirmKidYes'),

  // מחיקת תנועה
  confirmKidTxDialog: document.getElementById('confirmKidTxDialog'),
  confirmKidTxNo:     document.getElementById('confirmKidTxNo'),
  confirmKidTxYes:    document.getElementById('confirmKidTxYes'),
};

function openModal(el){ el.classList.remove('hidden'); document.body.style.overflow='hidden'; }
function closeModal(el){ el.classList.add('hidden'); document.body.style.overflow=''; }
function show(el, yes){ el.style.display = yes ? '' : 'none'; }

/* ---------- API ---------- */
// טוען ילדים + יתרה דרך ה-View
async function loadKidsWithBalance(sb) {
  const { data, error } = await sb
    .from('v_kid_balance')
    .select('kid_id,name,balance_cents')
    .order('name');
  if (error) throw error;
  return data || [];
}
async function insertKid(sb, name) {
  const { data:{ session } } = await sb.auth.getSession();
  if (!session?.user) throw new Error('לא מחובר');
  const { error } = await sb.from('children').insert({ user_id: session.user.id, name });
  if (error) throw error;
}
async function deleteKid(sb, kidId) {
  const { error } = await sb.from('children').delete().eq('id', kidId);
  if (error) throw error;
}
async function addKidTx(sb, kidId, type, amountILS, dateStr, note) {
  const { data:{ session } } = await sb.auth.getSession();
  if (!session?.user) throw new Error('לא מחובר');
  const signed = type === 'sub' ? -cents(amountILS) : cents(amountILS);
  const { error } = await sb.from('child_ledger').insert({
    user_id: session.user.id,
    child_id: kidId,
    amount_cents: signed,
    occurred_at: dateStr,
    note: note || ''
  });
  if (error) throw error;
}
async function deleteKidTx(sb, txId) {
  // מוחקים מהטבלה הבסיסית (ה-view kid_transactions ממופה אליה)
  const { error } = await sb.from('child_ledger').delete().eq('id', txId);
  if (error) throw error;
}
async function loadKidLedger(sb, kidId) {
  const { data, error } = await sb
    .from('kid_transactions') // view
    .select('id, amount_cents, occurred_at, note')
    .eq('kid_id', kidId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ---------- UI ---------- */
function kidCardHTML(k) {
  const balCls = (k.balance_cents||0) >= 0 ? 'ok' : 'bad';
  return `
    <div class="card kid" data-id="${k.kid_id}">
      <div class="bar">
        <h3 class="title" style="margin:0">${k.name}</h3>
        <span class="spacer"></span>
        <div class="muted small">יתרה: <b class="${balCls}">${toILS(k.balance_cents||0)}</b></div>
        <button class="btn icon kid-info" title="מידע">ℹ️</button>
        <button class="btn icon kid-delete" title="מחק">🗑️</button>
      </div>
      <div class="bar" style="gap:8px">
        <button class="btn primary kid-add">+ הוספה</button>
        <button class="btn kid-sub">− הורדה</button>
      </div>
    </div>
  `;
}

function ledgerRowHTML(r) {
  const d = new Date(r.occurred_at);
  const dstr = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`;
  const cls  = (r.amount_cents||0) >= 0 ? 'ok' : 'bad';
  const sign = (r.amount_cents||0) >= 0 ? '+' : '−';
  return `
    <div class="tx-row" data-id="${r.id}">
      <div class="tx-main">
        <div class="tx-text">
          <div class="tx-title">${sign} ${toILS(Math.abs(r.amount_cents||0))}</div>
          <div class="tx-note">${r.note || ''}</div>
          <div class="tx-meta">${dstr}</div>
        </div>
      </div>
      <div class="tx-right">
        <button class="tx-del" title="מחק">🗑️</button>
        <div class="tx-amt ${cls}">${toILS(r.amount_cents||0)}</div>
      </div>
    </div>
  `;
}

/* ---------- State ---------- */
let pendingDeleteKidId = null;
let openLedgerKidId = null;
let openLedgerKidName = '';
let pendingDeleteTxId = null;

/* ---------- חיווט ---------- */
(function init() {
  // ניווט
  els.openKidsBtn?.addEventListener('click', () => goTo('view-kids'));
  els.kidsBackBtn?.addEventListener('click', () => goTo('view-home'));

  // פתיחת מודאל "הוסף ילד"
  els.addKidBtn?.addEventListener('click', () => {
    els.kidName.value = '';
    els.addKidErr.textContent = '';
    openModal(els.addKidDialog);
    setTimeout(() => els.kidName.focus(), 50);
  });
  els.closeAddKid?.addEventListener('click', () => closeModal(els.addKidDialog));

  // שמירת ילד חדש
  els.addKidForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (els.kidName.value || '').trim();
    if (!name) { els.addKidErr.textContent = 'נא להזין שם'; return; }
    try {
      const sb = await waitForSb();
      await insertKid(sb, name);
      closeModal(els.addKidDialog);
      await refreshKids();
    } catch (err) {
      console.error(err);
      els.addKidErr.textContent = err?.message || String(err);
    }
  });

  // סגירת יומן
  els.closeKidsLog?.addEventListener('click', () => {
    openLedgerKidId = null;
    openLedgerKidName = '';
    show(els.kidsLogWrap, false);
  });

  // סגירת מודאל תנועה
  els.closeKidEntry?.addEventListener('click', () => closeModal(els.kidEntryDialog));

  // שמירת תנועה (הוספה/הורדה)
  els.kidEntryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.kidEntryErr.textContent = '';
    try {
      const sb = await waitForSb();
      const kidId = els.kidEntryChildId.value;
      const type  = els.kidEntryType.value; // add | sub
      const amount= Number(els.kidAmount.value || 0);
      const date  = els.kidDate.value;
      const note  = els.kidNote.value || '';
      if (!kidId) throw new Error('חסר מזהה ילד');
      if (!date)  throw new Error('יש לבחור תאריך');
      if (amount <= 0) throw new Error('סכום חייב להיות גדול מאפס');

      await addKidTx(sb, kidId, type, amount, date, note);

      closeModal(els.kidEntryDialog);
      await refreshKids();
      if (openLedgerKidId === kidId) await openLedger(kidId, openLedgerKidName);
    } catch (err) {
      console.error(err);
      els.kidEntryErr.textContent = err?.message || String(err);
    }
  });

  // מאזינים למחיקת תנועה מתוך היומן (באמצעות delegation)
  els.kidsLog?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tx-del');
    if (!btn) return;
    const row = btn.closest('.tx-row');
    if (!row) return;
    pendingDeleteTxId = row.dataset.id || null;
    if (!pendingDeleteTxId) return;

    openModal(els.confirmKidTxDialog);
  });

  // אישור/ביטול מחיקת תנועה
  els.confirmKidTxNo?.addEventListener('click', () => {
    pendingDeleteTxId = null;
    closeModal(els.confirmKidTxDialog);
  });
  els.confirmKidTxYes?.addEventListener('click', async () => {
    try {
      if (!pendingDeleteTxId) return;
      const sb = await waitForSb();
      await deleteKidTx(sb, pendingDeleteTxId);
      pendingDeleteTxId = null;
      closeModal(els.confirmKidTxDialog);

      // רענון יתרה ורשימה
      await refreshKids();
      if (openLedgerKidId) await openLedger(openLedgerKidId, openLedgerKidName);
    } catch (err) {
      console.error(err);
      alert('שגיאה במחיקת תנועה: ' + (err?.message || err));
    }
  });

  // אישור/ביטול מחיקת ילד
  els.confirmKidNo?.addEventListener('click', () => closeModal(els.confirmKidDialog));
  els.confirmKidYes?.addEventListener('click', async () => {
    try {
      if (!pendingDeleteKidId) return;
      const sb = await waitForSb();
      await deleteKid(sb, pendingDeleteKidId);
      pendingDeleteKidId = null;
      closeModal(els.confirmKidDialog);
      show(els.kidsLogWrap, false);
      await refreshKids();
    } catch (err) {
      console.error(err);
      alert('שגיאה במחיקת ילד: ' + (err?.message || err));
    }
  });

  // כאשר נכנסים למסך הילדים — טען רשימה
  const mo = new MutationObserver(() => {
    if (els.kidsView.classList.contains('active')) refreshKids();
  });
  mo.observe(document.body, { attributes:true, subtree:true, attributeFilter:['class'] });

  if (els.kidsView.classList.contains('active')) refreshKids();
})();

/* ---------- עזר ---------- */
async function refreshKids() {
  const sb = await waitForSb();
  try {
    const kids = await loadKidsWithBalance(sb);
    els.kidsList.innerHTML = kids.map(kidCardHTML).join('');

    // מאזינים לכל כרטיס
    els.kidsList.querySelectorAll('.kid').forEach(card => {
      const kidId = card.dataset.id;
      const name  = card.querySelector('.title')?.textContent || '';

      card.querySelector('.kid-info')?.addEventListener('click', async () => {
        await openLedger(kidId, name);
      });
      card.querySelector('.kid-add')?.addEventListener('click', () => {
        openKidEntry(kidId, name, 'add');
      });
      card.querySelector('.kid-sub')?.addEventListener('click', () => {
        openKidEntry(kidId, name, 'sub');
      });
      card.querySelector('.kid-delete')?.addEventListener('click', () => {
        pendingDeleteKidId = kidId;
        openModal(els.confirmKidDialog);
        const title = els.confirmKidDialog.querySelector('.title');
        if (title) title.textContent = `למחוק את הילד "${name}"?`;
      });
    });
  } catch (err) {
    console.error(err);
    els.kidsList.innerHTML = `<p class="msg err">שגיאה בטעינת ילדים: ${err?.message || err}</p>`;
  }
}

async function openLedger(kidId, name) {
  const sb = await waitForSb();
  const rows = await loadKidLedger(sb, kidId);
  els.kidsLogTitle.textContent = `יומן פעולות — ${name}`;
  els.kidsLog.innerHTML = rows.map(ledgerRowHTML).join('');
  show(els.kidsLogWrap, true);
  openLedgerKidId = kidId;
  openLedgerKidName = name;
}

function openKidEntry(kidId, name, type /* add | sub */) {
  els.kidEntryChildId.value = kidId;
  els.kidEntryType.value = type;
  els.kidAmount.value = '';
  els.kidDate.value = new Date().toISOString().slice(0,10);
  els.kidNote.value = '';
  els.kidEntryErr.textContent = '';
  const h = document.getElementById('kidEntryTitle');
  if (h) h.textContent = (type === 'add') ? `הוספת כסף — ${name}` : `הורדת כסף — ${name}`;
  openModal(els.kidEntryDialog);
  setTimeout(() => els.kidAmount.focus(), 50);
}
