// utils.js — פונקציות עזר גלובליות

// ניווט בין מסכים (views)
window.goTo = function (targetElOrId) {
  const target =
    typeof targetElOrId === "string"
      ? document.getElementById(targetElOrId)
      : targetElOrId;

  if (!target) {
    console.warn("goTo: view not found", targetElOrId);
    return;
  }
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  target.classList.add("active");
};
// utils.js — Theme toggle (Dark/Light) + שמירה ב-localStorage
(function themeBoot() {
  const KEY = 'app-theme'; // 'light' | 'dark'
  const root = document.documentElement;

  // קבע מצב התחלתי: מה-Storage או מהעדפת מערכת
  const saved = localStorage.getItem(KEY);
  if (saved === 'dark' || saved === 'light') {
    root.setAttribute('data-theme', saved);
  } else {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }

  // כפתור
  function toggleTheme() {
    const cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem(KEY, next);
  }

  // חבר לכפתור אם קיים
  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', toggleTheme);
  });
})();
