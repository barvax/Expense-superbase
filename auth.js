// ===== Supabase client (גלובלי פעם אחת) =====
   const SUPABASE_URL = "https://avhosytqnsqkrapnwhfq.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2aG9zeXRxbnNxa3JhcG53aGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MjMzMjMsImV4cCI6MjA3NjM5OTMyM30.j0fSPfrpOIlByTChwt1lrVx7bK6BVrl9c1Jt0_AEkPk";

if (!window.sb) {
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

// אירוע גלובלי – נודיע כשמוכן
if (!window.__sbReadyDispatched) {
  window.__sbReadyDispatched = true;
  window.dispatchEvent(new Event("sb-ready"));
}

// ===== ניהול מסכים (SPA) =====
const views = {
  login: document.getElementById("view-login"),
  home:  document.getElementById("view-home"),
};
function setActive(id) {
  Object.values(views).forEach(v => v && v.classList.remove("active"));
  views[id]?.classList.add("active");
  // אם יש container פנימי עם class="hidden" (כמו appScreen) – נחשוף אותו
  if (id === "home") document.getElementById("appScreen")?.classList.remove("hidden");
}

// אלמנטים של התחברות
const loginForm  = document.getElementById("loginForm");
const emailEl    = document.getElementById("email");
const passwordEl = document.getElementById("password");
const loginBtn   = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const userEmail  = document.getElementById("userEmail");
const logoutBtn  = document.getElementById("logoutBtn");

// ===== אתחול: אם יש סשן → ישר למסך הבית =====
(async () => {
  try {
    const { data:{ session } } = await sb.auth.getSession();
    if (session?.user) {
      if (userEmail) userEmail.textContent = session.user.email || "";
      setActive("home");
    } else {
      setActive("login");
    }
  } catch (e) {
    console.error(e);
    setActive("login");
  }
})();

// שינויי מצב התחברות
sb.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    if (userEmail) userEmail.textContent = session.user.email || "";
    goTo('view-home');
  } else {
     goTo('view-login');
  }
});

// לוגין
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginBtn.disabled = true;
  loginError.textContent = "";
  try {
    const email = (emailEl?.value || "").trim();
    const password = passwordEl?.value || "";
    if (!email || !password) throw new Error("נא להזין אימייל וסיסמה");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange יעביר ל-HOME
  } catch (err) {
    loginError.textContent = "שגיאה: " + (err?.message || err);
    console.error(err);
  } finally {
    loginBtn.disabled = false;
  }
});

// יציאה
logoutBtn?.addEventListener("click", async () => {
  await sb.auth.signOut();
});

