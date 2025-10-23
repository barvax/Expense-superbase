// forms.js — הוספת הכנסות/הוצאות + בחירת קטגוריות (modal)

// --- עזר: מחכה ל-sb אם עדיין לא קיים ---
function waitForSb() {
  return new Promise((resolve) => {
    if (window.sb) return resolve(window.sb);
    const onReady = () => { window.removeEventListener("sb-ready", onReady); resolve(window.sb); };
    window.addEventListener("sb-ready", onReady);
  });
}

// --- קטגוריות ברירת־מחדל (הוצאה) כולל התוספות שביקשת ---
const DEFAULT_EXPENSE_CATS = [
  { name: "דלק", emoji: "⛽️" }, { name: "רכב", emoji: "🚗" }, { name: "בית", emoji: "🏠" }, { name: "סופר", emoji: "🛒" },
  { name: "חשמל", emoji: "💡" }, { name: "בתי ספר", emoji: "🏫" }, { name: "חוגים", emoji: "🎵" }, { name: "שטויות", emoji: "🎁" },
  { name: "מסעדות", emoji: "🍔" }, { name: "בגדים", emoji: "👕" }, { name: "שונות", emoji: "✨" }, { name: "מזומן/כספומט", emoji: "🏧" },
  { name: "ביטוח", emoji: "🛡️" }, { name: "חיות", emoji: "🐶" }, { name: "תרבות", emoji: "🎭" },
  // תוספות:
  { name: "נופש", emoji: "🏖️" }, { name: "בריאות", emoji: "🩺" }, { name: "תחבורה ציבורית", emoji: "🚌" }
];

// (אופציונלי) קטגוריות הכנסה בסיסיות
const DEFAULT_INCOME_CATS = [
  { name: "משכורת", emoji: "💼" }, { name: "מתנות", emoji: "🎉" }, { name: "החזרי מס", emoji: "🧾" }, { name: "אחר", emoji: "➕" }
];

// --- DOM refs (לפי ה-IDs שנתת/הוספת ב-HTML) ---
const els = {
  // פתיחה/סגירה
  addIncomeBtn:  document.getElementById("addIncomeBtn"),
  addExpenseBtn: document.getElementById("addExpenseBtn"),
  addDialog:     document.getElementById("addDialog"),
  addTitle:      document.getElementById("addTitle"),
  closeAddBtn:   document.getElementById("closeAddBtn"),

  // טאבים
  tabExpense:    document.getElementById("tabExpense"),
  tabIncome:     document.getElementById("tabIncome"),

  // בורר קטגוריות
  categoryPicker:document.getElementById("categoryPicker"),
  categoryGrid:  document.getElementById("categoryGrid"),

  // טופס
  txForm:        document.getElementById("txForm"),
  txKind:        document.getElementById("txKind"),       // 'expense' | 'income'
  txCategoryId:  document.getElementById("txCategoryId"),  // UUID של קטגוריה
  txAmount:      document.getElementById("txAmount"),
  txDate:        document.getElementById("txDate"),
  txNote:        document.getElementById("txNote"),
  txErr:         document.getElementById("txErr"),

  // מצבי הוצאה
  expenseModeBlock: document.getElementById("expenseModeBlock"),
  installmentsBlock:document.getElementById("installmentsBlock"),
  txMonths:      document.getElementById("txMonths"),
};

// --- עזרי UI/זמן ---
function showModal(show){ els.addDialog.classList.toggle("hidden", !show); }
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function clearActiveTiles(){ [...els.categoryGrid.querySelectorAll('.cat-tile')].forEach(n=>n.classList.remove('cat-tile--active')); }

function setTab(kind){ // 'expense' | 'income'
  els.txKind.value = kind;
  els.addTitle.textContent = kind === 'expense' ? 'הוספת הוצאה' : 'הוספת הכנסה';
  els.tabExpense?.classList.toggle('active', kind==='expense');
  els.tabIncome ?.classList.toggle('active', kind==='income');

  // הצג/הסתר בורר קטגוריות ומצב הוצאה
  els.categoryPicker?.classList.toggle('hidden', kind==='income');
  els.expenseModeBlock?.classList.toggle('hidden', kind==='income');
  if (kind==='income') els.installmentsBlock?.classList.add('hidden');
}

async function ensureAuth(sb){
  const { data:{ session } } = await sb.auth.getSession();
  if (!session?.user) throw new Error('לא מחובר');
  return session.user;
}

// יוצר למשתמש את קטגוריות ברירת־המחדל אם חסרות (פעם אחת)
async function ensureDefaultCategories(sb){
  const user = await ensureAuth(sb);
  const { data: rows, error } = await sb.from('categories').select('name,kind');
  if (error) throw error;
  const have = new Set((rows||[]).map(r => `${r.kind}:${r.name}`));

  const toInsert = [];
  DEFAULT_EXPENSE_CATS.forEach(c => { if (!have.has(`expense:${c.name}`)) toInsert.push({ user_id:user.id, name:c.name, kind:'expense', icon:c.emoji }); });
  DEFAULT_INCOME_CATS.forEach(c  => { if (!have.has(`income:${c.name}`))  toInsert.push({ user_id:user.id, name:c.name, kind:'income',  icon:c.emoji }); });

  if (toInsert.length){
    const { error: insErr } = await sb.from('categories').upsert(toInsert, { onConflict: 'user_id,name,kind' });
    if (insErr) throw insErr;
  }
}

// בונה גריד קטגוריות (הוצאה) מה-DB
async function buildCategoryGrid(sb){
  const { data, error } = await sb.from('categories').select('id,name,kind,icon').eq('kind','expense').order('name');
  if (error) throw error;
  els.categoryGrid.innerHTML = '';
  (data||[]).forEach(row => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'cat-tile';
    tile.dataset.id = row.id;
    tile.innerHTML = `<div class="cat-emoji">${row.icon || '🏷️'}</div><div class="cat-name">${row.name}</div>`;
    tile.addEventListener('click', () => {
      clearActiveTiles();
      tile.classList.add('cat-tile--active');
      els.txCategoryId.value = row.id;
    });
    els.categoryGrid.appendChild(tile);
  });
}

// פתיחה – הוצאה
async function openExpense(sb){
  await ensureDefaultCategories(sb);
  await buildCategoryGrid(sb);
  setTab('expense');
  els.txErr.textContent = '';
  els.txAmount.value = '';
  els.txDate.value = todayISO();
  els.txNote.value = '';
  els.txCategoryId.value = '';
  clearActiveTiles();
  // הקלדה ידנית בתאריך – off; יעדיף בורר
  els.txDate.setAttribute('inputmode','none');
  els.txDate.addEventListener('keydown', ev => ev.preventDefault(), { once:true });
  showModal(true);
}

// פתיחה – הכנסה
async function openIncome(sb){
  await ensureDefaultCategories(sb);
  setTab('income');
  els.txErr.textContent = '';
  els.txAmount.value = '';
  els.txDate.value = todayISO();
  els.txNote.value = '';
  els.txCategoryId.value = ''; // לא נדרש להכנסה
  els.txDate.setAttribute('inputmode','none');
  els.txDate.addEventListener('keydown', ev => ev.preventDefault(), { once:true });
  showModal(true);
}

// שליטה במצבי הוצאה (segmented)
document.querySelectorAll('.seg__btn[data-mode]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.seg__btn').forEach(b=>b.classList.remove('seg__btn--active'));
    btn.classList.add('seg__btn--active');
    const mode = btn.dataset.mode;
    els.installmentsBlock?.classList.toggle('hidden', mode!=='installments');
    els.txForm.dataset.mode = mode;
  });
});

// סגירת מודאל
els.closeAddBtn?.addEventListener('click', ()=>showModal(false));
els.addDialog?.addEventListener('click', (e)=>{ if (e.target.classList.contains('modal__backdrop')) showModal(false); });

// פתיחת המודאל מהכפתורים במסך הראשי
(async () => {
  const sb = await waitForSb();
  els.addExpenseBtn?.addEventListener('click', ()=>openExpense(sb));
  els.addIncomeBtn ?.addEventListener('click', ()=>openIncome(sb));
})();

// שמירה
els.txForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  els.txErr.textContent = '';
  const sb = await waitForSb();
  try{
    const user = await ensureAuth(sb);
    const kind = els.txKind.value; // 'expense' | 'income'
    const amount = parseFloat(els.txAmount.value || '0');
    if (!amount || amount <= 0) throw new Error('נא להזין סכום חוקי');
    const amount_cents = Math.round(amount * 100);
    const occurred_at = els.txDate.value || todayISO();
    const note = els.txNote.value || '';

    if (kind === 'income') {
      const { error } = await sb.from('transactions').insert({
        user_id: user.id, kind: 'income', category_id: null,
        amount_cents, occurred_at, note
      });
      if (error) throw error;
    } else {
      const category_id = els.txCategoryId.value;
      if (!category_id) throw new Error('בחר/י קטגוריה להוצאה');

      const mode = els.txForm.dataset.mode || 'one_time';
      if (mode === 'installments') {
        const months = parseInt(els.txMonths.value || '0', 10);
        if (!months || months < 1) throw new Error('מספר תשלומים חייב להיות 1 ומעלה');
        // RPC מהסכימה: add_installments(category_id, total_amount_cents, start_date, months, note)
        const { error } = await sb.rpc('add_installments', {
          p_category_id: category_id,
          p_total_amount_cents: amount_cents,
          p_start_date: occurred_at,
          p_months: months,
          p_note: note
        });
        if (error) throw error;
      } else {
        const { error } = await sb.from('transactions').insert({
          user_id: user.id, kind: 'expense', category_id,
          amount_cents, occurred_at, note, expense_mode: 'one_time'
        });
        if (error) throw error;
      }
    }

    showModal(false);
    // רענון KPI במסך הראשי
    window.dispatchEvent(new Event('tx-changed'));
  }catch(err){
    console.error(err);
    els.txErr.textContent = err?.message || String(err);
  }
});
