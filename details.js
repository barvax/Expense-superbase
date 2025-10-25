// details.js — פירוט חודשי, מחיקה (כולל קדימה לתשלומים/קבועות)

function waitForSb() {
  return new Promise((resolve) => {
    if (window.sb) return resolve(window.sb);
    const onReady = () => { window.removeEventListener("sb-ready", onReady); resolve(window.sb); };
    window.addEventListener("sb-ready", onReady);
  });
}

const ILS = new Intl.NumberFormat('he-IL', { style:'currency', currency:'ILS', maximumFractionDigits:0 });
const toILS = (cents) => ILS.format(Math.round((cents||0)/100));

function selectedHomeYM() {
  const m = document.getElementById('monthSelect')?.value;
  const y = document.getElementById('yearSelect')?.value;
  if (m && y) return `${y}-${String(m).padStart(2,'0')}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
const monthStart = (ym) => `${ym}-01`;
function fmtDate(dstr) {
  const d = new Date(dstr);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`;
}

/* ---------- אלמנטים ---------- */
const els = {
  openBtn:       document.getElementById('openDetailsBtn'),
  dialog:        document.getElementById('detailsDialog'),
  closeBtn:      document.getElementById('closeDetailsBtn'),
  title:         document.getElementById('detailsTitle'),

  tabs:          document.querySelectorAll('#detailsDialog .tabs .tab'),
  list:          document.getElementById('detailsList'),
  sumExpense:    document.getElementById('sumExpense'),
  sumIncome:     document.getElementById('sumIncome'),
  sumDelta:      document.getElementById('sumDelta'),
  hint:          document.getElementById('detailsHint'),

  // דיאלוג אישור מחיקה (כללי באפליקציה)
  confirmDialog: document.getElementById('confirmDialog'),
  confirmText:   document.getElementById('confirmText'),
  confirmNo:     document.getElementById('confirmNo'),
  confirmYes:    document.getElementById('confirmYes'),
};

let pendingDeleteId = null;

function showDialog(show) {
  els.dialog.classList.toggle('hidden', !show);
  document.body.style.overflow = show ? 'hidden' : '';
}
function showConfirm(show) {
  els.confirmDialog.classList.toggle('hidden', !show);
  document.body.style.overflow = show ? 'hidden' : '';
}

/* ---------- טעינת נתונים ---------- */
async function loadCatsMap(sb) {
  const { data, error } = await sb.from('categories').select('id,name,icon');
  if (error) throw error;
  const map = new Map();
  (data||[]).forEach(c => map.set(c.id, { name:c.name, icon:c.icon }));
  return map;
}

async function loadMonthTx(sb, ym, kindFilter='all') {
  const first = monthStart(ym);
  // next month first
  const [y,m] = ym.split('-').map(Number);
  const nextFirst = new Date(y, m, 1); // JS: חודש 0-מבוסס => זה היום הראשון של החודש הבא
  const nextStr = `${nextFirst.getFullYear()}-${String(nextFirst.getMonth()+1).padStart(2,'0')}-01`;

  let q = sb.from('transactions')
    .select('id,kind,category_id,amount_cents,occurred_at,note,expense_mode,installments_total,installment_index,installment_group_id')
    .gte('occurred_at', first)
    .lt('occurred_at', nextStr)
    .order('occurred_at', { ascending: false });

  if (kindFilter !== 'all') q = q.eq('kind', kindFilter);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function rowHTML(t, cat) {
  const isInc = t.kind === 'income';
  const emoji = cat?.icon || (isInc ? '➕' : '🏷️');
  const catName = isInc ? 'הכנסה' : (cat?.name || '—');
  const amtCls = isInc ? 'ok' : 'bad';
  const dateStr = fmtDate(t.occurred_at);
  const note = t.note || '';

  // חיווי מצב הוצאה
  let modeBadge = '';
  if (!isInc) {
    if (t.expense_mode === 'installments') {
      const idx = t.installment_index ?? '?';
      const tot = t.installments_total ?? '?';
      modeBadge = `<span class="badge">תשלומים ${idx}/${tot}</span>`;
    } else if (t.expense_mode === 'recurring') {
      modeBadge = `<span class="badge">קבועה</span>`;
    }
  }

  return `
  <div class="tx-row" data-id="${t.id}">
    <div class="tx-main">
      <div class="tx-emoji">${emoji}</div>
      <div class="tx-text">
        <div class="tx-title">${catName} ${modeBadge}</div>
        <div class="tx-note">${note}</div>
        <div class="tx-meta">${dateStr}</div>
      </div>
    </div>
    <div class="tx-right">
      <div class="tx-amt ${amtCls}">${toILS(t.amount_cents)}</div>
      <button class="tx-del" data-id="${t.id}" title="מחק">🗑️</button>
    </div>
  </div>`;
}

function sumsHTML(rows) {
  let inc=0, exp=0;
  rows.forEach(r => {
    if (r.kind === 'income') inc += r.amount_cents||0;
    else exp += r.amount_cents||0;
  });
  els.sumIncome.textContent  = toILS(inc);
  els.sumExpense.textContent = toILS(exp);
  els.sumDelta.textContent   = toILS(inc-exp);
}

/* ---------- רענון רשימה ---------- */
async function refreshList(sb, kind='all') {
  const ym = selectedHomeYM();
  els.title.textContent = `פירוט חודשי — ${ym}`;
  const [cats, rows] = await Promise.all([
    loadCatsMap(sb),
    loadMonthTx(sb, ym, kind)
  ]);

  els.list.innerHTML = rows.map(r => rowHTML(r, cats.get(r.category_id))).join('');
  sumsHTML(rows);
  els.hint.textContent = rows.length ? '' : 'אין תנועות בחודש הנבחר.';
}

/* ---------- חיווט ---------- */
(async () => {
  const sb = await waitForSb();

  // פתיחה
  els.openBtn?.addEventListener('click', async () => {
    await refreshList(sb, 'all');
    showDialog(true);
  });

  // סגירה
  els.closeBtn?.addEventListener('click', () => showDialog(false));

  // פילטרים (הכול / הוצאות / הכנסות)
  els.tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      els.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const kind = tab.dataset.kind || 'all';
      await refreshList(sb, kind);
    });
  });

  // בקשה למחיקה (פתיחת אישור)
  els.list?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.tx-del');
    if (!btn) return;
    pendingDeleteId = btn.dataset.id;

    try {
      const { data: txRows } = await sb
        .from('transactions')
        .select('kind, expense_mode, installment_group_id, occurred_at')
        .eq('id', pendingDeleteId)
        .limit(1);
      const tx = txRows?.[0];

      if (tx?.kind === 'expense' &&
          (tx.expense_mode === 'installments' || tx.expense_mode === 'recurring') &&
          tx?.installment_group_id) {
        const label = tx.expense_mode === 'recurring' ? 'הוצאה קבועה' : 'תשלומים';
        els.confirmText.textContent = `למחוק את כל ${label} העתידיים בסדרה זו (מהחודש הזה והלאה)?`;
      } else {
        els.confirmText.textContent = "למחוק את התנועה הזו? פעולה זו לא ניתנת לשחזור.";
      }
    } catch {
      els.confirmText.textContent = "למחוק את התנועה הזו? פעולה זו לא ניתנת לשחזור.";
    }

    showConfirm(true);
  });

  // אישור/ביטול מחיקה
  els.confirmNo?.addEventListener('click', () => { pendingDeleteId = null; showConfirm(false); });

  els.confirmYes?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      const { data: txRows, error: txErr } = await sb
        .from('transactions')
        .select('id, kind, expense_mode, installment_group_id, occurred_at')
        .eq('id', pendingDeleteId)
        .limit(1);
      if (txErr) throw txErr;

      const tx = txRows?.[0];
      if (!tx) throw new Error('התנועה לא נמצאה');

      if (tx.kind === 'expense' &&
          (tx.expense_mode === 'installments' || tx.expense_mode === 'recurring') &&
          tx.installment_group_id) {

        // מחיקה קדימה של כל הסדרה (כולל החודש הנוכחי)
        const { error: rpcErr } = await sb.rpc('delete_future_series', {
          p_group_id: tx.installment_group_id,
          p_from: tx.occurred_at
        });
        if (rpcErr) throw rpcErr;

      } else {
        // מחיקה בודדת
        const { error } = await sb.from('transactions').delete().eq('id', pendingDeleteId);
        if (error) throw error;
      }

      pendingDeleteId = null;
      showConfirm(false);

      // רענון הרשימה (השאר את הפילטר הנוכחי)
      const activeKind = document.querySelector('#detailsDialog .tabs .tab.active')?.dataset?.kind || 'all';
      await refreshList(sb, activeKind);

      // לדווח לשאר האפליקציה
      window.dispatchEvent(new Event('tx-changed'));

    } catch (err) {
      console.error(err);
      alert('שגיאה במחיקה: ' + (err?.message || err));
    }
  });

  // אם נוספו/נמחקו תנועות בזמן שהדיאלוג פתוח — רענן
  window.addEventListener('tx-changed', async () => {
    if (!els.dialog.classList.contains('hidden')) {
      const activeKind = document.querySelector('#detailsDialog .tabs .tab.active')?.dataset?.kind || 'all';
      await refreshList(sb, activeKind);
    }
  });
})();
