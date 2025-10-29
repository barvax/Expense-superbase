// budget.js — בניית תקציב חודשי + סיכום מול ביצוע (קטגוריה/חודש)

/* ----------------------- עזר ----------------------- */
function waitForSb() {
  return new Promise((resolve) => {
    if (window.sb) return resolve(window.sb);
    const onReady = () => { window.removeEventListener("sb-ready", onReady); resolve(window.sb); };
    window.addEventListener("sb-ready", onReady);
  });
}

const ILS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const toILS = (cents) => ILS.format(Math.round((cents || 0) / 100));
const cents = (n) => Math.max(0, Math.round((Number(n) || 0) * 100));

function selectedHomeYM() {
  const monthSelect = document.getElementById('monthSelect');
  const yearSelect  = document.getElementById('yearSelect');
  if (yearSelect?.value && monthSelect?.value) {
    return `${yearSelect.value}-${String(monthSelect.value).padStart(2,'0')}`;
  }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
const monthStart = (ym) => `${ym}-01`;
function firstOfNextMonthFrom(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

/* ----------------------- אלמנטים ----------------------- */
const els = {
  openBudgetBtn: document.getElementById('openBudgetBtn'),
  openBudgetSummaryBtn: document.getElementById('openBudgetSummaryBtn'),

  vBudget: document.getElementById('view-budget'),
  budgetBackBtn: document.getElementById('budgetBackBtn'),
  budgetMonth: document.getElementById('budgetMonth'),
  copyFromBtn: document.getElementById('copyFromBtn'),
  copyFromMonth: document.getElementById('copyFromMonth'),
  saveBudgetBtn: document.getElementById('saveBudgetBtn'),
  budgetList: document.getElementById('budgetList'),
  budgetTotal: document.getElementById('budgetTotal'),
  budgetMsg: document.getElementById('budgetMsg'),

  vSummary: document.getElementById('view-budget-summary'),
  summaryBackBtn: document.getElementById('budgetSummaryBackBtn'),
  summaryMonth: document.getElementById('summaryMonth'),
  summaryList: document.getElementById('summaryList'),
};

/* ----------------------- API ----------------------- */
async function loadExpenseCategories(sb) {
  const { data, error } = await sb
    .from('categories')
    .select('id,name,icon')
    .eq('kind','expense')
    .order('name');
  if (error) throw error;
  return data || [];
}

async function loadBudgetsForMonth(sb, ym) {
  const first = monthStart(ym);

  // 1️⃣ טען את התקציבים שהוגדרו לחודש הזה
  const { data: budgetData, error: budgetErr } = await sb
    .from('monthly_budgets')
    .select('category_id, amount_cents')
    .eq('month', first);
  if (budgetErr) throw budgetErr;

  const budgetMap = new Map();
  (budgetData || []).forEach(b => budgetMap.set(b.category_id, b.amount_cents || 0));

  // 2️⃣ טען גם את ההוצאות בפועל (רק חד-פעמיות!)
  const { data: spentData, error: spentErr } = await sb
    .from('v_monthly_category_spend_regular')
    .select('*')
    .eq('month', first);
  if (spentErr) throw spentErr;

  const spentMap = new Map();
  (spentData || []).forEach(r => spentMap.set(r.category_id, r.spent_cents || 0));

  return { budgetMap, spentMap };
}

async function saveBudgets(sb, ym) {
  els.saveBudgetBtn.disabled = true;
  els.budgetMsg.textContent = '';
  try {
    const first = monthStart(ym);
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) throw new Error('לא מחובר');

    const upserts = [];
    els.budgetList.querySelectorAll('.budget-row').forEach(row => {
      const catId = row.dataset.cat;
      const val   = row.querySelector('.amt').value;
      upserts.push({
        user_id: session.user.id,
        category_id: catId,
        month: first,
        amount_cents: cents(val),
      });
    });

    if (upserts.length) {
      const { error } = await sb
        .from('monthly_budgets')
        .upsert(upserts, { onConflict: 'user_id,category_id,month' });
      if (error) throw error;
    }

    els.budgetMsg.textContent = 'נשמר ✔';
    window.dispatchEvent(new Event('tx-changed'));
  } catch (err) {
    console.error(err);
    els.budgetMsg.textContent = 'שגיאה: ' + (err?.message || err);
  } finally {
    els.saveBudgetBtn.disabled = false;
  }
}

async function copyBudgetFromMonth(sb, fromYM, toYM) {
  const from = monthStart(fromYM);
  const to   = monthStart(toYM);
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) throw new Error('לא מחובר');

  const { data, error } = await sb
    .from('monthly_budgets')
    .select('category_id, amount_cents')
    .eq('month', from);
  if (error) throw error;

  if (!data || !data.length) {
    els.budgetMsg.textContent = 'אין תקציב בחודש המקור.';
    return;
  }

  const rows = data.map(r => ({
    user_id: session.user.id,
    category_id: r.category_id,
    month: to,
    amount_cents: r.amount_cents || 0,
  }));

  const { error: upErr } = await sb
    .from('monthly_budgets')
    .upsert(rows, { onConflict: 'user_id,category_id,month' });
  if (upErr) throw upErr;

  els.budgetMsg.textContent = 'הועתק ✔';

  const cats = await loadExpenseCategories(sb);
  const maps = await loadBudgetsForMonth(sb, toYM);
  renderBudgetRows(cats, maps.budgetMap);
}

async function loadSummary(sb, ym) {
  const first = monthStart(ym);

  // תקציב לפי קטגוריה
  const { data: budgets, error: bErr } = await sb
    .from('monthly_budgets')
    .select('category_id, amount_cents')
    .eq('month', first);
  if (bErr) throw bErr;
  const budgetByCat = new Map((budgets || []).map(b => [b.category_id, b.amount_cents || 0]));

  // הוצאות בפועל (רק חד-פעמיות) לפי ה-View החדש
  const { data: spentRows, error: sErr } = await sb
    .from('v_monthly_category_spend_regular')
    .select('category_id, spent_cents')
    .eq('month', first);
  if (sErr) throw sErr;

  const spentByCat = new Map();
  (spentRows || []).forEach(r => spentByCat.set(r.category_id, r.spent_cents || 0));

  // קטגוריות לשמות/אייקון
  const { data: cats, error: cErr } = await sb
    .from('categories')
    .select('id,name,icon')
    .eq('kind','expense')
    .order('name');
  if (cErr) throw cErr;

  // בניית פריט-פר-קטגוריה
  els.summaryList.innerHTML = (cats || []).map(c => {
    const budget = budgetByCat.get(c.id) || 0;
    const spent  = spentByCat.get(c.id) || 0;
    const left   = Math.max(0, budget - spent);
    const pct    = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : (spent > 0 ? 100 : 0);
    const over   = spent > budget;

    return `
      <div class="cat-item">
        <div class="cat-head">
          <div class="cat-name">${c.icon || '🏷️'} ${c.name}</div>
          <div class="cat-figs">
            הוקצב: ${toILS(budget)} · הוצא: ${toILS(spent)} · נשאר: ${toILS(left)}
          </div>
        </div>
        <div class="prog ${over ? 'over' : ''}">
<div class="fill" style="width:${pct}%; --target-width:${pct}%;"></div>
        </div>
      </div>
    `;
  }).join('');

  // --- סה״כ כללי בתחתית ---
  let totalBudget = 0, totalSpent = 0;
  (cats || []).forEach(c => {
    totalBudget += budgetByCat.get(c.id) || 0;
    totalSpent  += spentByCat.get(c.id) || 0;
  });
  const totalLeft = Math.max(0, totalBudget - totalSpent);
  const totalPct  = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : (totalSpent > 0 ? 100 : 0);
  const totalOver = totalSpent > totalBudget;

  els.summaryList.insertAdjacentHTML('beforeend', `
    <hr class="sum-sep" />
    <div class="cat-item total">
      <div class="cat-head">
        <div class="cat-name">סה״כ</div>
        <div class="cat-figs">
          הוקצב: ${toILS(totalBudget)} · הוצא: ${toILS(totalSpent)} · נשאר: ${toILS(totalLeft)}
        </div>
      </div>
      <div class="prog ${totalOver ? 'over' : ''}">
        <div class="fill" style="width:${totalPct}%"></div>
      </div>
    </div>
  `);

  // חיווי כללי על חריגות (אופציונלי)
  const overs = (cats || []).filter(c => (spentByCat.get(c.id) || 0) > (budgetByCat.get(c.id) || 0));
  if (overs.length && els.budgetMsg && els.vBudget.classList.contains('active')) {
    els.budgetMsg.textContent = `שים לב: יש חריגות ב-${overs.length} קטגוריות.`;
  }
}

/* ----------------------- UI ----------------------- */
function renderBudgetRows(cats, existingBudgetsMap) {
  els.budgetList.innerHTML = (cats || []).map(c => {
    const centsVal = existingBudgetsMap.get(c.id) ?? 0;
    const val = centsVal ? (centsVal / 100).toString() : '';
    return `
      <div class="budget-row" data-cat="${c.id}">
        <div class="label"><span>${c.icon || '🏷️'}</span><span>${c.name}</span></div>
        <input type="number" class="amt" min="0" step="1" placeholder="₪" value="${val}" inputmode="numeric" />
      </div>
    `;
  }).join('');

  recalcTotal();
  els.budgetList.querySelectorAll('.amt').forEach(inp => inp.addEventListener('input', recalcTotal));
}

function recalcTotal() {
  let sum = 0;
  els.budgetList.querySelectorAll('.budget-row .amt').forEach(inp => {
    sum += cents(inp.value);
  });
  els.budgetTotal.textContent = toILS(sum);
}

/* ----------------------- חיווט ----------------------- */
(async () => {
  const sb = await waitForSb();

  // פתיחת "בנה תקציב"
  els.openBudgetBtn?.addEventListener('click', async () => {
    const ym = selectedHomeYM();
    els.budgetMonth.value = ym;

    const cats = await loadExpenseCategories(sb);
    const maps = await loadBudgetsForMonth(sb, ym);
    renderBudgetRows(cats, maps.budgetMap);

    goTo('view-budget');
  });

  // פתיחת "סיכום תקציב"
  els.openBudgetSummaryBtn?.addEventListener('click', async () => {
    const ym = selectedHomeYM();
    els.summaryMonth.value = ym;
    await loadSummary(sb, ym);
    goTo('view-budget-summary');
  });

  els.budgetBackBtn?.addEventListener('click', () => goTo('view-home'));
  els.summaryBackBtn?.addEventListener('click', () => goTo('view-home'));

  els.budgetMonth?.addEventListener('change', async () => {
    const ym = els.budgetMonth.value;
    const cats = await loadExpenseCategories(sb);
    const maps = await loadBudgetsForMonth(sb, ym);
    renderBudgetRows(cats, maps.budgetMap);
  });

  els.summaryMonth?.addEventListener('change', async () => {
    await loadSummary(sb, els.summaryMonth.value);
  });

  els.copyFromBtn?.addEventListener('click', async () => {
    const fromYM = els.copyFromMonth.value;
    const toYM   = els.budgetMonth.value;
    if (!fromYM || !toYM) {
      els.budgetMsg.textContent = 'בחר/י חודש מקור ויעד.';
      return;
    }
    await copyBudgetFromMonth(sb, fromYM, toYM);
  });

  els.saveBudgetBtn?.addEventListener('click', async () => {
    await saveBudgets(sb, els.budgetMonth.value);
  });

  window.addEventListener('tx-changed', async () => {
    if (document.getElementById('view-budget-summary')?.classList.contains('active')) {
      await loadSummary(sb, els.summaryMonth.value || selectedHomeYM());
    }
  });
})();
