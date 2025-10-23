// details.js — פירוט חודשי לפי החודש שנבחר במסך הראשי

function waitForSb() {
  return new Promise((resolve) => {
    if (window.sb) return resolve(window.sb);
    const onReady = () => { window.removeEventListener("sb-ready", onReady); resolve(window.sb); };
    window.addEventListener("sb-ready", onReady);
  });
}

// DOM
const els = {
  openBtn: document.getElementById('openDetailsBtn'),
  dlg:     document.getElementById('detailsDialog'),
  closeBtn:document.getElementById('closeDetailsBtn'),
  title:   document.getElementById('detailsTitle'),
  list:    document.getElementById('detailsList'),
  hint:    document.getElementById('detailsHint'),

  sumIncome:  document.getElementById('sumIncome'),
  sumExpense: document.getElementById('sumExpense'),
  sumDelta:   document.getElementById('sumDelta'),

  // פילטרים
  fltAll:     document.getElementById('fltAll'),
  fltExpense: document.getElementById('fltExpense'),
  fltIncome:  document.getElementById('fltIncome'),

  // בוררי חודש קיימים ב-app: input#month או selects (נתמוך בשני המודלים)
  monthInput:  document.getElementById('month'),
  monthSelect: document.getElementById('monthSelect'),
  yearSelect:  document.getElementById('yearSelect'),
};

function showModal(show){
  els.dlg.classList.toggle('hidden', !show);
  document.body.classList.toggle('no-scroll', show);
}

function fmtILS(cents){
  const ILS = new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0});
  return ILS.format(Math.round((cents||0)/100));
}

function ymFromUI(){
  if (els.monthInput && els.monthInput.value) return els.monthInput.value; // YYYY-MM
  if (els.monthSelect && els.yearSelect && els.monthSelect.value && els.yearSelect.value) {
    return `${els.yearSelect.value}-${els.monthSelect.value}`;
  }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function monthRange(ym){ // -> { from:'YYYY-MM-01', to:'YYYY-MM-01 (next)' }
  const [y,m] = ym.split('-').map(s=>parseInt(s,10));
  const from = `${y}-${String(m).padStart(2,'0')}-01`;
  const d = new Date(y, m, 1); // m is 1-based? fix: native month is 0-based, so:
  // Correct Calc: next month:
  const next = new Date(y, m, 1); // since Date uses 0-based month, pass m (current+1) gives first of next month
  const to = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`;
  return { from, to };
}

// נטען קטגוריות למיפוי id-> {name, icon}
async function loadCategoryMap(sb){
  const { data, error } = await sb.from('categories').select('id,name,icon');
  if (error) throw error;
  const map = new Map();
  (data||[]).forEach(r=>map.set(r.id, { name:r.name, icon:r.icon }));
  return map;
}

function rowHTML(t, cat){
  const isInc = t.kind === 'income';
  const emoji = cat?.icon || (isInc ? '➕' : '🏷️');
  const catName = isInc ? 'הכנסה' : (cat?.name || '—');
  const date = new Date(t.occurred_at);
  const dateStr = `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}`;
  const amtCls = isInc ? 'ok' : 'bad';
  const note = t.note || '';
  return `
  <div class="tx-row">
    <div class="tx-main">
      <div class="tx-emoji">${emoji}</div>
      <div class="tx-text">
        <div class="tx-title">${catName}</div>
        <div class="tx-note">${note || ''}</div>
        <div class="tx-meta">${dateStr}</div>
      </div>
    </div>
    <div class="tx-amt ${amtCls}">${fmtILS(t.amount_cents)}</div>
  </div>`;
}

async function loadDetails(sb, filterKind /* 'all'|'expense'|'income' */){
  const ym = ymFromUI();
  const { from, to } = monthRange(ym);
  els.title.textContent = `פירוט לחודש ${ym}`;

  els.list.innerHTML = '';
  els.hint.textContent = 'טוען נתונים...';
  els.sumIncome.textContent = '₪0';
  els.sumExpense.textContent = '₪0';
  els.sumDelta.textContent = '₪0';

  // נטען קטגוריות למפה
  const catMap = await loadCategoryMap(sb);

  // נטען תנועות לחודש
  let q = sb.from('transactions')
            .select('id,kind,category_id,amount_cents,occurred_at,note')
            .gte('occurred_at', from)
            .lt('occurred_at', to)
            .order('occurred_at', { ascending: false });

  if (filterKind === 'expense') q = q.eq('kind','expense');
  if (filterKind === 'income')  q = q.eq('kind','income');

  const { data, error } = await q;
  if (error) { els.hint.textContent = 'שגיאה: ' + error.message; return; }

  if (!data || !data.length) {
    els.hint.textContent = 'אין תנועות לחודש זה.';
    return;
  }

  // סכומים
  let sumIncome = 0, sumExpense = 0;
  const html = data.map(t => {
    if (t.kind === 'income') sumIncome += t.amount_cents;
    else sumExpense += t.amount_cents;
    const cat = catMap.get(t.category_id);
    return rowHTML(t, cat);
  }).join('');
  els.list.innerHTML = html;
  els.hint.textContent = '';

  const delta = sumIncome - sumExpense;
  els.sumIncome.textContent  = fmtILS(sumIncome);
  els.sumExpense.textContent = fmtILS(sumExpense);
  els.sumDelta.textContent   = fmtILS(delta);
}

function activateTab(btn){
  [els.fltAll, els.fltExpense, els.fltIncome].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

// פתיחה/סגירה
(async () => {
  const sb = await waitForSb();

  els.openBtn?.addEventListener('click', async () => {
    showModal(true);
    activateTab(els.fltAll);
    await loadDetails(sb, 'all');
  });

  els.closeBtn?.addEventListener('click', ()=>showModal(false));
  els.dlg?.addEventListener('click', (e)=>{
    if (e.target.classList.contains('modal__backdrop')) showModal(false);
  });

  // פילטרים
  els.fltAll?.addEventListener('click', async ()=>{
    activateTab(els.fltAll); await loadDetails(sb, 'all');
  });
  els.fltExpense?.addEventListener('click', async ()=>{
    activateTab(els.fltExpense); await loadDetails(sb, 'expense');
  });
  els.fltIncome?.addEventListener('click', async ()=>{
    activateTab(els.fltIncome); await loadDetails(sb, 'income');
  });

  // כשיש תנועה חדשה → לרענן גם את הפירוט אם פתוח
  window.addEventListener('tx-changed', async ()=>{
    if (!els.dlg.classList.contains('hidden')) {
      const active = document.querySelector('.tabs .tab.active')?.dataset?.kind || 'all';
      await loadDetails(sb, active);
    }
  });
})();
