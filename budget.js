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
  const d = new Date(y, m, 1); // JS: month is 0-based → m here is current month (1-12) → new Date(y,m,1) = first of next month
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

/* ----------------------- אלמנטים ----------------------- */
const els = {
  // כפתורים מהבית
  openBudgetBtn: document.getElementById('openBudgetBtn'),
  openBudgetSummaryBtn: document.getElementById('openBudgetSummaryBtn'),

  // מסך "בנה תקציב"
  vBudget: document.getElementById('view-budget'),
  budgetBackBtn: document.getElementById('budgetBackBtn'),
  budgetMonth: document.getElementById('budgetMonth'),
  copyFromBtn: document.getElementById('copyFromBtn'),
  copyFromMonth: document.getElementById('copyFromMonth'),
  saveBudgetBtn: document.getElementById('saveBudgetBtn'),
  budgetList: document.getElementById('budgetList'),
  budgetTotal: document.getElementById('budgetTotal'),
  budgetMsg: document.getElementById('budgetMsg'),

  // מסך "סיכום תקציב"
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
  const { data, error } = await sb
    .from('monthly_budgets')
    .select('category_id, amount_cents')
    .eq('month', first);
  if (error) throw error;
  const map = new Map();
  (data || []).forEach(b => map.set(b.category_id, b.amount_cents || 0));
  return map;
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
    window.dispatchEvent(new Event('tx-changed')); // רענון כללי למאזינים
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
  const map  = await loadBudgetsForMonth(sb, toYM);
  renderBudgetRows(cats, map);
}

async function loadSummary(sb, ym) {
  const first = monthStart(ym);
  const nextFirst = firstOfNextMonthFrom(ym);

  // תקציב לפי קטגוריה
  const { data: budgets, error: bErr } = await sb
    .from('monthly_budgets')
    .select('category_id, amount_cents')
    .eq('month', first);
  if (bErr) throw bErr;
  const budgetByCat = new Map((budgets || []).map(b => [b.category_id, b.amount_cents || 0]));

  // הוצאות לחודש זה בקבוצות
  const { data: spentRows, error: sErr } = await sb
    .from('transactions')
    .select('category_id, amount_cents')
    .eq('kind','expense')
    .gte('occurred_at', first)
    .lt('occurred_at', nextFirst);
  if (sErr) throw sErr;

  const spentByCat = new Map();
  (spentRows || []).forEach(t => {
    const prev = spentByCat.get(t.category_id) || 0;
    spentByCat.set(t.category_id, prev + (t.amount_cents || 0));
  });

  // קטגוריות לשמות/אייקון
  const { data: cats, error: cErr } = await sb
    .from('categories')
    .select('id,name,icon')
    .eq('kind','expense')
    .order('name');
  if (cErr) throw cErr;

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
          <div class="fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // חיווי כללי על חריגות (אופציונלי)
  const overs = (cats || []).filter(c => (spentByCat.get(c.id) || 0) > (budgetByCat.get(c.id) || 0));
  if (overs.length && els.budgetMsg && els.vBudget.classList.contains('active')) {
    els.budgetMsg.textContent = `שים לב: יש חריגות ב-${overs.length} קטגוריות.`;
  }
}

/* ----------------------- UI: רנדר/חישוב ----------------------- */
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
  els.budgetList.querySelectorAll('.amt').forEach(inp => {
    inp.addEventListener('input', recalcTotal);
  });
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
    const map  = await loadBudgetsForMonth(sb, ym);
    renderBudgetRows(cats, map);

    goTo('view-budget');
  });

  // פתיחת "סיכום תקציב"
  els.openBudgetSummaryBtn?.addEventListener('click', async () => {
    const ym = selectedHomeYM();
    els.summaryMonth.value = ym;
    await loadSummary(sb, ym);
    goTo('view-budget-summary');
  });

  // חזרה
  els.budgetBackBtn?.addEventListener('click', () => goTo('view-home'));
  els.summaryBackBtn?.addEventListener('click', () => goTo('view-home'));

  // שינוי חודש במסכי התקציב/סיכום
  els.budgetMonth?.addEventListener('change', async () => {
    const ym = els.budgetMonth.value;
    const cats = await loadExpenseCategories(sb);
    const map  = await loadBudgetsForMonth(sb, ym);
    renderBudgetRows(cats, map);
  });

  els.summaryMonth?.addEventListener('change', async () => {
    await loadSummary(sb, els.summaryMonth.value);
  });

  // העתקה מחודש אחר
  els.copyFromBtn?.addEventListener('click', async () => {
    const fromYM = els.copyFromMonth.value;
    const toYM   = els.budgetMonth.value;
    if (!fromYM || !toYM) {
      els.budgetMsg.textContent = 'בחר/י חודש מקור ויעד.';
      return;
    }
    await copyBudgetFromMonth(sb, fromYM, toYM);
  });

  // שמירה
  els.saveBudgetBtn?.addEventListener('click', async () => {
    await saveBudgets(sb, els.budgetMonth.value);
  });

  // אם נוספה תנועה חדשה בזמן שהסיכום פתוח → רענון
  window.addEventListener('tx-changed', async () => {
    if (document.getElementById('view-budget-summary')?.classList.contains('active')) {
      await loadSummary(sb, els.summaryMonth.value || selectedHomeYM());
    }
  });
})();
