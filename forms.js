// forms.js — הוספת הכנסה/הוצאה (חד-פעמית / תשלומים / קבועה)

function waitForSb() {
  return new Promise((resolve) => {
    if (window.sb) return resolve(window.sb);
    const onReady = () => { window.removeEventListener("sb-ready", onReady); resolve(window.sb); };
    window.addEventListener("sb-ready", onReady);
  });
}

/* ---------- אלמנטים ---------- */
const els = {
  // כפתורי פתיחה מהמסך הראשי
  addIncomeBtn:  document.getElementById('addIncomeBtn'),
  addExpenseBtn: document.getElementById('addExpenseBtn'),

  // מודאל הוספה
  dialog:        document.getElementById('addDialog'),
  closeBtn:      document.getElementById('closeAddBtn'),
  title:         document.getElementById('addTitle'),

  // טאבים
  tabExpense:    document.getElementById('tabExpense'),
  tabIncome:     document.getElementById('tabIncome'),

  // פיקר קטגוריות (להוצאה)
  picker:        document.getElementById('categoryPicker'),
  grid:          document.getElementById('categoryGrid'),

  // טופס
  form:          document.getElementById('txForm'),
  txKind:        document.getElementById('txKind'),
  txCategoryId:  document.getElementById('txCategoryId'),
  txAmount:      document.getElementById('txAmount'),
  txDate:        document.getElementById('txDate'),
  txNote:        document.getElementById('txNote'),
  txErr:         document.getElementById('txErr'),

  // מצב הוצאה
  modeBlock:     document.getElementById('expenseModeBlock'),
  segBtns:       document.querySelectorAll('#expenseModeBlock .seg__btn'),
  installments:  document.getElementById('installmentsBlock'),
  txMonths:      document.getElementById('txMonths'),
};

const ILS = new Intl.NumberFormat('he-IL', { style:'currency', currency:'ILS', maximumFractionDigits:0 });
const cents = (n) => Math.max(0, Math.round((Number(n)||0) * 100));

/* ---------- לוגיקה פנימית ---------- */
let expenseMode = 'one_time'; // one_time | installments | recurring

function showAddDialog(show) {
  els.dialog.classList.toggle('hidden', !show);
  document.body.style.overflow = show ? 'hidden' : '';
}

function setKind(kind) {
  // kind = 'expense' | 'income'
  els.txKind.value = kind;
  els.title.textContent = kind === 'income' ? 'הוספת הכנסה' : 'הוספת הוצאה';

  // הכנסות לא צריכות קטגוריה/מצב הוצאה
  els.picker.classList.toggle('hidden', kind === 'income');
  els.modeBlock.classList.toggle('hidden', kind === 'income');

  if (kind === 'income') {
    els.txCategoryId.value = '';
  }
}

function clearForm(kindDefault = 'expense') {
  setKind(kindDefault);
  els.txAmount.value = '';
  els.txDate.value = new Date().toISOString().slice(0,10);
  els.txNote.value = '';
  els.txErr.textContent = '';

  // מצב הוצאה—להתחל מחדש לחד-פעמית
  expenseMode = 'one_time';
  els.segBtns.forEach(b => b.classList.remove('seg__btn--active'));
  const btn = document.querySelector('#expenseModeBlock .seg__btn[data-mode="one_time"]');
  if (btn) btn.classList.add('seg__btn--active');
  els.installments.classList.add('hidden');
}

function renderCategories(list) {
  // כפתורי קטגוריה
  els.grid.innerHTML = (list||[]).map(c => `
    <button class="cat" data-id="${c.id}" title="${c.name}">
      <span class="emoji">${c.icon || '🏷️'}</span>
      <span class="name">${c.name}</span>
    </button>
  `).join('');

  els.grid.querySelectorAll('.cat').forEach(btn => {
    btn.addEventListener('click', () => {
      els.txCategoryId.value = btn.dataset.id;
      // היילייט בחירה
      els.grid.querySelectorAll('.cat').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* ---------- פתיחת דיאלוג ---------- */
(async () => {
  const sb = await waitForSb();

  // טאב הוצאה
  els.tabExpense?.addEventListener('click', async () => {
    els.tabExpense.classList.add('active');
    els.tabIncome.classList.remove('active');
    setKind('expense');
    // טען קטגוריות הוצאה
    const { data, error } = await sb.from('categories').select('id,name,icon').eq('kind','expense').order('name');
    if (!error) renderCategories(data || []);
  });

  // טאב הכנסה
  els.tabIncome?.addEventListener('click', () => {
    els.tabIncome.classList.add('active');
    els.tabExpense.classList.remove('active');
    setKind('income');
  });

  // פתיחת “+ הוצאה”
  els.addExpenseBtn?.addEventListener('click', async () => {
    clearForm('expense');
    // טען קטגוריות הוצאה
    const { data, error } = await sb.from('categories').select('id,name,icon').eq('kind','expense').order('name');
    if (!error) renderCategories(data || []);
    showAddDialog(true);
  });

  // פתיחת “+ הכנסה”
  els.addIncomeBtn?.addEventListener('click', () => {
    clearForm('income');
    showAddDialog(true);
  });

  // סגירה
  els.closeBtn?.addEventListener('click', () => showAddDialog(false));

  // בחירת מצב הוצאה (segment)
  els.segBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      els.segBtns.forEach(b => b.classList.remove('seg__btn--active'));
      btn.classList.add('seg__btn--active');
      expenseMode = btn.dataset.mode; // one_time | installments | recurring

      if (expenseMode === 'installments') {
        els.installments.classList.remove('hidden');
      } else {
        els.installments.classList.add('hidden');
      }
    });
  });

  // Submit
  els.form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.txErr.textContent = '';
    try {
      const kind = els.txKind.value; // 'expense' | 'income'
      const amount = Number(els.txAmount.value || 0);
      const dateStr = els.txDate.value;
      const note = els.txNote.value || '';

      if (!dateStr) throw new Error('נא לבחור תאריך');
      if (amount <= 0) throw new Error('סכום חייב להיות גדול מאפס');

      if (kind === 'income') {
        const { error } = await sb.from('transactions').insert({
          kind: 'income',
          amount_cents: Math.round(amount * 100),
          occurred_at: dateStr,
          note
        });
        if (error) throw error;

      } else {
        // הוצאה
        const catId = els.txCategoryId.value;
        if (!catId) throw new Error('נא לבחור קטגוריה להוצאה');

        const amountCents = Math.round(amount * 100);

        if (expenseMode === 'one_time') {
          const { error } = await sb.from('transactions').insert({
            kind: 'expense',
            category_id: catId,
            amount_cents: amountCents,
            occurred_at: dateStr,
            note,
            expense_mode: 'one_time'
          });
          if (error) throw error;

        } else if (expenseMode === 'installments') {
          const months = Math.max(1, parseInt(els.txMonths.value || '1', 10));
          const { error } = await sb.rpc('add_installments', {
            p_category_id: catId,
            p_total_amount_cents: amountCents,
            p_start_date: dateStr,
            p_months: months,
            p_note: note
          });
          if (error) throw error;

        } else if (expenseMode === 'recurring') {
          // ברירת מחדל 36 חודשים (3 שנים קדימה)
          const { error } = await sb.rpc('add_recurring_expense', {
            p_category_id: catId,
            p_amount_cents: amountCents,
            p_start_date: dateStr,
            p_months: 36,
            p_note: note
          });
          if (error) throw error;
        }
      }

      showAddDialog(false);
      window.dispatchEvent(new Event('tx-changed')); // שיודיע למסכים אחרים לרענן

    } catch (err) {
      console.error(err);
      els.txErr.textContent = err?.message || String(err);
    }
  });
})();
