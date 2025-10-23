// app.js — מסך הבית: סיכום חודשי + טעינת נתונים

// --- מחכה ל-sb אם עדיין לא קיים (נוצר ב-auth.js) ---
function waitForSb() {
  return new Promise((resolve) => {
    if (window.sb) return resolve(window.sb);
    const onReady = () => { window.removeEventListener("sb-ready", onReady); resolve(window.sb); };
    window.addEventListener("sb-ready", onReady);
  });
}

// --- DOM ---
const els = {
  // בורר חודש — תומך בשתי גישות:
  monthInput:  document.getElementById('month'),        // <input type="month"> (קיים אצלך כיום)
  monthSelect: document.getElementById('monthSelect'),   // <select> (אופציונלי)
  yearSelect:  document.getElementById('yearSelect'),    // <select> (אופציונלי)

  kpiIncome: document.getElementById('kpiIncome'),
  kpiExpense: document.getElementById('kpiExpense'),
  kpiDelta:   document.getElementById('kpiDelta'),
  hint:       document.getElementById('hint'),
  err:        document.getElementById('err'),
};

const ILS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const fmt = (cents) => ILS.format(Math.round((cents || 0) / 100));

// --- עזרי חודש ---
function nowYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; // YYYY-MM
}

// במקרה של <input type="month">
function getInputYM() {
  return els.monthInput?.value || null;
}
function setInputYM(ym) {
  if (els.monthInput) els.monthInput.value = ym;
}

// במקרה של שני <select>
function fillMonthYearDefaultsIfNeeded() {
  const mSel = els.monthSelect, ySel = els.yearSelect;
  if (!mSel || !ySel) return; // לא בשימוש כרגע

  // חודשים 01..12
  const monthVals = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  mSel.innerHTML = monthVals.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('');

  // שנים: השנה-4 עד השנה+1
  const y = new Date().getFullYear();
  const years = [];
  for (let yy = y - 4; yy <= y + 1; yy++) years.push(yy);
  ySel.innerHTML = years.map(yy=>`<option value="${yy}">${yy}</option>`).join('');

  // ברירת מחדל = חודש נוכחי
  const now = new Date();
  mSel.value = String(now.getMonth()+1).padStart(2,'0');
  ySel.value = String(now.getFullYear());
}

function getSelectYM() {
  const mSel = els.monthSelect, ySel = els.yearSelect;
  if (!mSel || !ySel) return null;
  if (!mSel.value || !ySel.value) return null;
  return `${ySel.value}-${mSel.value}`; // YYYY-MM
}

// --- קריאת נתונים ---
async function loadMonthlySummary(sb, ym /* 'YYYY-MM' */) {
  try {
    if (!ym) return;
    els.err.textContent  = '';
    els.hint.textContent = 'טוען נתונים...';
    els.kpiIncome.textContent = '₪0';
    els.kpiExpense.textContent = '₪0';
    els.kpiDelta.textContent   = '₪0';

    const [y,m] = ym.split('-');
    const monthDate = `${y}-${m}-01`;

    const { data, error } = await sb
      .from('v_monthly_summary')
      .select('*')
      .eq('month', monthDate)
      .limit(1);

    if (error) throw error;

    if (!data || !data.length) {
      els.hint.textContent = 'אין נתונים לחודש זה.';
      return;
    }

    const row = data[0];
    els.kpiIncome.textContent = fmt(row.income_cents);
    els.kpiExpense.textContent = fmt(row.expense_cents);
    els.kpiDelta.textContent   = fmt(row.delta_cents);
    els.hint.textContent = '';
  } catch (e) {
    console.error(e);
    els.err.textContent = 'שגיאה: ' + (e?.message || e);
  }
}

// --- אתחול כללי ---
(async () => {
  const sb = await waitForSb();

  // ודא שיש סשן לפני טעינת נתונים
  const { data:{ session } } = await sb.auth.getSession();
  if (!session?.user) return; // auth.js מטפל בהצגת הלוגין

  // תרחיש A: יש input type="month" (המצב הנוכחי אצלך)
  if (els.monthInput) {
    // ברירת מחדל
    const ymDefault = nowYM();
    setInputYM(ymDefault);

    // טעינה ראשונית
    await loadMonthlySummary(sb, getInputYM());

    // מאזין שינוי
    els.monthInput.addEventListener('change', async (e) => {
      const ym = e.target.value;
      await loadMonthlySummary(sb, ym);
    });
  }

  // תרחיש B (אופציונלי): אם בעתיד תחליף לבורר selectים
  if (els.monthSelect && els.yearSelect) {
    fillMonthYearDefaultsIfNeeded();

    // טעינה ראשונית
    const ymSel = getSelectYM();
    await loadMonthlySummary(sb, ymSel);

    // מאזינים
    els.monthSelect.addEventListener('change', async () => {
      await loadMonthlySummary(sb, getSelectYM());
    });
    els.yearSelect.addEventListener('change', async () => {
      await loadMonthlySummary(sb, getSelectYM());
    });
  }

  // רענון KPI אחרי הוספה (forms.js יורה את האירוע הזה)
  window.addEventListener('tx-changed', async () => {
    // קבע איזה בורר פעיל וקבל ym
    let ym = null;
    if (els.monthInput && els.monthInput.value) ym = els.monthInput.value;
    else if (els.monthSelect && els.yearSelect) ym = getSelectYM();
    if (!ym) ym = nowYM();

    await loadMonthlySummary(sb, ym);
  });
})();
