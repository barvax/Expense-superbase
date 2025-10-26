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
  monthInput:  document.getElementById('month'),
  monthSelect: document.getElementById('monthSelect'),
  yearSelect:  document.getElementById('yearSelect'),
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
// function fillMonthYearDefaultsIfNeeded() {
//   const mSel = els.monthSelect, ySel = els.yearSelect;
//   if (!mSel || !ySel) return; // לא בשימוש כרגע

//   // חודשים 01..12
//   const monthVals = ['01','02','03','04','05','06','07','08','09','10','11','12'];
//   mSel.innerHTML = monthVals.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('');

//   // שנים: השנה-4 עד השנה+1
//   const y = new Date().getFullYear();
//   const years = [];
//   for (let yy = y - 4; yy <= y + 1; yy++) years.push(yy);
//   ySel.innerHTML = years.map(yy=>`<option value="${yy}">${yy}</option>`).join('');

//   // ברירת מחדל = חודש נוכחי
//   const now = new Date();
//   mSel.value = String(now.getMonth()+1).padStart(2,'0');
//   ySel.value = String(now.getFullYear());
// }

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
setRing(0, 0); // מאפס את הדונאט בזמן טעינה


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
      setRing(0, 0); // גם כאן לאפס את הדונאט
      return;
    }

   
const row = data[0];
const income = row.income_cents || 0;
const expense = row.expense_cents || 0;

// מציג בדונאט ובכותרת
setRing(income, expense);

// נקה הודעת “טוען…”
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
  //  fillMonthYearDefaultsIfNeeded();

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
// --- Month/Year selects: אתחול ברירת מחדל לחודש הנוכחי ושנים עד 2030 ---
(function initMonthYear() {
  const monthSel = document.getElementById('monthSelect');
  const yearSel  = document.getElementById('yearSelect');
  if (!monthSel || !yearSel) return;

  // חודשים 01..12
  monthSel.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = String(m).padStart(2,'0');
    opt.textContent = String(m).padStart(2,'0');
    monthSel.appendChild(opt);
  }

  // שנים: לדוגמה 2020..2030 (בחר מה שמתאים לך; כאן עד 2030)
  const thisYear = new Date().getFullYear();
  const startYear = Math.min(thisYear, 2020);
  const endYear   = 2030;
  yearSel.innerHTML = '';
  for (let y = startYear; y <= endYear; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSel.appendChild(opt);
  }

  // ברירת מחדל: היום
  const now = new Date();
  monthSel.value = String(now.getMonth()+1).padStart(2,'0');
  yearSel.value  = String(now.getFullYear());

  // אם יש לך פונקציה שטוענת KPI לפי חודש, קרא לה כאן כדי להציג מיד
  // loadKpisForSelectedMonth();  // דוגמה: אם קיימת אצלך
})();
// הזרועות בדונאט
function setRing(incomeCents, expenseCents) {
  const income  = Math.max(0, Number(incomeCents)  || 0);
  const expense = Math.max(0, Number(expenseCents) || 0);
  const remain  = Math.max(0, income - expense);

  // טקסטים במרכז
  const remainEl = document.getElementById('ringRemain');
  const daysEl   = document.getElementById('ringDays');
  if (remainEl) remainEl.textContent = ILS.format(Math.round(remain / 100));

  // ציור באחוזים (pathLength=100)
  const incCirc = document.getElementById('ring-income-circ');
  const expCirc = document.getElementById('ring-expense-circ');

  if (incCirc) {
    incCirc.setAttribute('stroke-dasharray', '100 100');
    incCirc.setAttribute('stroke-dashoffset', '0');
  }

  let pct = 0;                      // % מההכנסה
  if (income > 0) pct = Math.min(100, (expense / income) * 100);
  else if (expense > 0) pct = 100;  // אין הכנסות – כל ההוצאה = 100%

  if (expCirc) {
    expCirc.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
    expCirc.setAttribute('stroke-dashoffset', '0');
  }

  // אופציונלי: ימים שנותרו אם החודש הנוכחי
  try {
    const ymSel =
      (document.getElementById('month')?.value) ||
      (document.getElementById('yearSelect')?.value && document.getElementById('monthSelect')?.value
        ? `${document.getElementById('yearSelect').value}-${document.getElementById('monthSelect').value}` : null);
    if (ymSel && daysEl) {
      const [y, m] = ymSel.split('-').map(Number);
      const now = new Date();
      if (now.getFullYear() === y && now.getMonth() + 1 === m) {
        const daysInMonth = new Date(y, m, 0).getDate();
        daysEl.textContent = `${Math.max(0, daysInMonth - now.getDate())} days left`;
      } else {
        daysEl.textContent = '';
      }
    }
  } catch {}
}
