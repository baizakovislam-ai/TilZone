// ============================================================
//  TilZone SPA — script.js
//  Full version: Auth + Lessons (translate/choice/fill) + Theory API + Profile
// ============================================================

const API_BASE = "http://localhost:8000/v1";
// http://localhost:8000/v1
// ── Global state ──────────────────────────────────────────────
let currentUser        = JSON.parse(localStorage.getItem("tilzone_user"))       || null;
let accessToken        = localStorage.getItem("tilzone_access_token")           || null;
let refreshToken       = localStorage.getItem("tilzone_refresh_token")          || null;
let currentLang        = localStorage.getItem("tilzone_lang")                   || "ky";
let currentStudyLang   = localStorage.getItem("tilzone_study_lang")             || "en";
let currentPage        = "home";
let pendingVerifyEmail = localStorage.getItem("tilzone_pending_verify_email")   || "";
let currentProfileTab  = "stats";
let currentRatingSubtab = "global";
let timerInterval      = null;

// Lesson state
let activeLessonId     = null;
let lessonTasks        = [];
let taskIndex          = 0;
let taskAnswered       = false;

// Theory state
let allTheoryCards     = [];
let activeTheoryCat    = "";

// AI chat
const aiScenarios = [
  { id:1, name:"☕ Кафе",        dialog:[{role:"assistant",text:"Добрый день! Что желаете заказать?"}] },
  { id:2, name:"✈️ Аэропорт",   dialog:[{role:"assistant",text:"Ваш билет, пожалуйста."}] },
  { id:3, name:"🏫 Университет", dialog:[{role:"assistant",text:"Какой факультет вы выбрали?"}] },
  { id:4, name:"💼 Работа",      dialog:[{role:"assistant",text:"Расскажите о своём опыте работы."}] },
  { id:5, name:"🏨 Отель",       dialog:[{role:"assistant",text:"На сколько ночей вы хотите забронировать?"}] },
];
let currentScenario = aiScenarios[0];
let chatHistory     = [...currentScenario.dialog];
let sessionErrors   = [];

// ══════════════════════════════════════════════════════════════
//  API CLIENT
// ══════════════════════════════════════════════════════════════

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data   = data;
  }
}

async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : opts.body;

  let res = await fetch(`${API_BASE}${path}`, { method: opts.method || "GET", headers, body });

  if (res.status === 401 && refreshToken) {
    const ok = await tryRefreshToken();
    if (ok) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { method: opts.method || "GET", headers, body });
    } else {
      logout(); showAuthModal();
      throw new ApiError("Session expired", 401, {});
    }
  }

  if (!res.ok) {
    let errData;
    try { errData = await res.json(); } catch { errData = {}; }
    const message = errData?.detail?.error?.message || errData?.error?.message || errData?.detail || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, errData);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiUpload(path, formData) {
  const headers = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
  if (!res.ok) {
    let errData;
    try { errData = await res.json(); } catch { errData = {}; }
    throw new ApiError(errData?.detail?.error?.message || `HTTP ${res.status}`, res.status, errData);
  }
  return res.json();
}

async function tryRefreshToken() {
  if (!refreshToken) return false;
  try {
    const data = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).then(r => r.json());
    if (data.access_token) {
      accessToken = data.access_token;
      localStorage.setItem("tilzone_access_token", accessToken);
      if (data.refresh_token) {
        refreshToken = data.refresh_token;
        localStorage.setItem("tilzone_refresh_token", refreshToken);
      }
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

function saveSession(data) {
  currentUser  = data.user;
  accessToken  = data.access_token;
  refreshToken = data.refresh_token || null;
  localStorage.setItem("tilzone_user",         JSON.stringify(currentUser));
  localStorage.setItem("tilzone_access_token", accessToken);
  if (refreshToken) localStorage.setItem("tilzone_refresh_token", refreshToken);
}

function logout() {
  currentUser = null; accessToken = null; refreshToken = null;
  ["tilzone_user","tilzone_access_token","tilzone_refresh_token"].forEach(k => localStorage.removeItem(k));
}

// ══════════════════════════════════════════════════════════════
//  UI UTILITIES
// ══════════════════════════════════════════════════════════════

function showToast(msg, type = "success") {
  document.getElementById("tilzone-toast")?.remove();
  const colors = { success:"bg-green-500", error:"bg-red-500", info:"bg-blue-500", warn:"bg-amber-500" };
  const el = document.createElement("div");
  el.id = "tilzone-toast";
  el.className = `fixed top-5 right-5 z-[200] text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${colors[type]||colors.success}`;
  el.innerText = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function setElText(id, val)       { const e = document.getElementById(id); if (e) e.innerText = String(val); }
function setElStyle(id, prop, v)  { const e = document.getElementById(id); if (e) e.style[prop] = v; }
function showEl(id)  { const e = document.getElementById(id); if (e) { e.classList.remove("hidden"); e.classList.add("flex"); } }
function hideEl(id)  { const e = document.getElementById(id); if (e) { e.classList.add("hidden");    e.classList.remove("flex"); } }
function showBlock(id) { const e = document.getElementById(id); if (e) e.classList.remove("hidden"); }
function hideBlock(id) { const e = document.getElementById(id); if (e) e.classList.add("hidden"); }

function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerText = loading ? "..." : label;
}

function showFieldError(id, msg) {
  const field = document.getElementById(id);
  if (!field) return;
  field.classList.add("border-red-400");
  field.nextElementSibling?.classList.contains("field-error") && field.nextElementSibling.remove();
  const p = document.createElement("p");
  p.className = "field-error text-xs text-red-500 mt-1";
  p.innerText = msg;
  field.insertAdjacentElement("afterend", p);
}

function clearFieldErrors(scope) {
  scope?.querySelectorAll(".field-error").forEach(e => e.remove());
  scope?.querySelectorAll(".border-red-400").forEach(e => e.classList.remove("border-red-400"));
}

function showAuthModal() { showEl("authModal"); }
function hideAuthModal() { hideEl("authModal"); }

// ══════════════════════════════════════════════════════════════
//  i18n
// ══════════════════════════════════════════════════════════════

const i18n = {
  ky: { nav_home:"Башкы", nav_ai:"AI Сүйлөшүү", nav_theory:"Теория", nav_mvp:"MVP Режим", nav_profile:"Профиль",
        streak_label:"Катары менен күн", daily_label:"Күндүк тапшырмалар", xp_label:"Жалпы тажрыйба",
        level_label:"Денгээл", learning_path_title:"Окуу жолу", scores_title:"Сабактардын баасы",
        login_btn:"Кирүү", register_btn:"Катталуу", auth_title:"Улантуу үчүн аккаунт керек",
        logout:"Чыгуу", stats_tab:"Статистика", achievements_tab:"Жетишкендиктер",
        rating_tab:"Рейтинг", settings_tab:"Орнотуулар", days:"күн",
        ai_title:"AI Сүйлөшүү", scenarios:"Сценарийлер", history:"Диалог тарыхы",
        theory_title:"Теория", mvp_title:"MVP Режим", mvp_desc:"Жөнөкөй окуу",
        loading:"Жүктөлүүдө...", global:"Глобалдык", pvp:"PvP" },
  ru: { nav_home:"Главная", nav_ai:"AI Собеседник", nav_theory:"Теория", nav_mvp:"MVP Режим", nav_profile:"Профиль",
        streak_label:"Дней подряд", daily_label:"Ежедневные задания", xp_label:"Всего XP",
        level_label:"Уровень", learning_path_title:"Путь обучения", scores_title:"Оценки уроков",
        login_btn:"Войти", register_btn:"Регистрация", auth_title:"Для продолжения войдите",
        logout:"Выйти", stats_tab:"Статистика", achievements_tab:"Достижения",
        rating_tab:"Рейтинг", settings_tab:"Настройки", days:"дн.",
        ai_title:"AI Собеседник", scenarios:"Сценарии", history:"История",
        theory_title:"Теория", mvp_title:"MVP Режим", mvp_desc:"Упрощённое обучение",
        loading:"Загрузка...", global:"Глобальный", pvp:"PvP" },
  en: { nav_home:"Home", nav_ai:"AI Chat", nav_theory:"Theory", nav_mvp:"MVP Mode", nav_profile:"Profile",
        streak_label:"Day streak", daily_label:"Daily quests", xp_label:"Total XP",
        level_label:"Level", learning_path_title:"Learning path", scores_title:"Lesson scores",
        login_btn:"Login", register_btn:"Sign up", auth_title:"Please login to continue",
        logout:"Logout", stats_tab:"Statistics", achievements_tab:"Achievements",
        rating_tab:"Leaderboard", settings_tab:"Settings", days:"days",
        ai_title:"AI Companion", scenarios:"Scenarios", history:"History",
        theory_title:"Theory", mvp_title:"MVP Mode", mvp_desc:"Simplified learning",
        loading:"Loading...", global:"Global", pvp:"PvP" },
};

function applyUILanguage(lang) {
  currentLang = lang;
  localStorage.setItem("tilzone_lang", lang);
  setElText("currentLangLabel", { ky:"Кыргызча", en:"English", ru:"Русский" }[lang] || lang);
  const t = i18n[lang] || i18n.ru;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (t[k]) el.innerText = t[k];
  });
}

// ══════════════════════════════════════════════════════════════
//  AUTH UI
// ══════════════════════════════════════════════════════════════

function updateUIForAuth() {
  const authContainer = document.getElementById("authButtonsDesktop");
  if (currentUser) {
    if (authContainer) {
      authContainer.innerHTML = `
        <div class="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full cursor-pointer" id="navUserBtn">
          ${currentUser.avatar
            ? `<img src="http://localhost:8000${currentUser.avatar}" class="w-8 h-8 rounded-full object-cover">`
            : `<div class="w-8 h-8 bg-green-200 rounded-full flex items-center justify-center"><i class="fas fa-smile text-green-700 text-sm"></i></div>`}
          <span class="text-sm font-semibold">${currentUser.name}</span>
        </div>`;
      document.getElementById("navUserBtn")?.addEventListener("click", () => loadPage("profile"));
    }
    const xp = currentUser.xp || 0;
    setElText("streakValue", currentUser.streak ?? 0);
    setElText("xpValue",     xp);
    setElText("levelValue",  currentUser.level || Math.floor(xp/100)+1);
    setElStyle("xpBar","width", `${xp % 100}%`);
    setElText("profileName",     currentUser.name || "");
    setElText("profileUsername", `@${currentUser.username||""}`);
    setElText("profileStreak",   currentUser.streak ?? 0);
    setElText("profileXP",       xp);
    setElText("profileLeague",   currentUser.league || "Bronze");
  } else {
    if (authContainer) {
      authContainer.innerHTML = `<button id="showLoginBtnNav" class="bg-green-500 text-white px-4 py-2 rounded-full text-sm">Войти</button>`;
      document.getElementById("showLoginBtnNav")?.addEventListener("click", () => loadPage("login"));
    }
    setElText("streakValue","0"); setElText("xpValue","0"); setElText("levelValue","1");
    setElStyle("xpBar","width","0%");
  }
}

// ══════════════════════════════════════════════════════════════
//  AUTH PAGES
// ══════════════════════════════════════════════════════════════

function initLoginPage() {
  document.getElementById("doLoginBtn")?.addEventListener("click", doLogin);
  document.getElementById("loginPassword")?.addEventListener("keydown", e => { if(e.key==="Enter") doLogin(); });
  document.getElementById("forgotLink")?.addEventListener("click", e => { e.preventDefault(); loadPage("forgot"); });
  document.getElementById("toRegisterFromLogin")?.addEventListener("click", e => { e.preventDefault(); loadPage("register"); });
}

async function doLogin() {
  const loginVal = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value;
  clearFieldErrors(document.querySelector(".bg-white.rounded-3xl"));
  if (!loginVal) return showFieldError("loginEmail","Введите email или username");
  if (!password) return showFieldError("loginPassword","Введите пароль");
  setLoading("doLoginBtn", true, "Войти");
  try {
    const data = await apiFetch("/auth/login", { method:"POST", json:{ login:loginVal, password } });
    saveSession(data); updateUIForAuth(); loadPage("home");
  } catch(err) {
    const code = err.data?.detail?.error?.code || err.data?.error?.code;
    if (code === "email_not_verified") {
      pendingVerifyEmail = loginVal.includes("@") ? loginVal : "";
      localStorage.setItem("tilzone_pending_verify_email", pendingVerifyEmail);
      showToast("Сначала подтвердите email", "info");
      loadPage("verify");
      return;
    }
    showToast(err.message || "Ошибка входа", "error");
    setLoading("doLoginBtn", false, "Войти");
  }
}

function initRegisterPage() {
  document.getElementById("doRegisterBtn")?.addEventListener("click", doRegister);
  document.getElementById("toLoginFromReg")?.addEventListener("click", e => { e.preventDefault(); loadPage("login"); });
}

async function doRegister() {
  const name     = document.getElementById("regName")?.value.trim();
  const username = document.getElementById("regUsername")?.value.trim();
  const email    = document.getElementById("regEmail")?.value.trim();
  const password = document.getElementById("regPassword")?.value;
  const confirm  = document.getElementById("regConfirm")?.value;
  clearFieldErrors(document.querySelector(".bg-white.rounded-3xl"));
  if (!name)              return showFieldError("regName","Введите имя");
  if (!username)          return showFieldError("regUsername","Введите username");
  if (!email)             return showFieldError("regEmail","Введите email");
  if (!password)          return showFieldError("regPassword","Введите пароль");
  if (password !== confirm) return showFieldError("regConfirm","Пароли не совпадают");
  setLoading("doRegisterBtn", true, "Зарегистрироваться");
  try {
    const data = await apiFetch("/auth/register",{ method:"POST", json:{ name, username, email, password, password_confirmation:confirm } });
    pendingVerifyEmail = data.email || email;
    localStorage.setItem("tilzone_pending_verify_email", pendingVerifyEmail);
    showToast(data.message || "Код подтверждения отправлен");
    loadPage("verify");
  } catch(err) {
    showToast(err.message || "Ошибка регистрации","error");
    setLoading("doRegisterBtn", false, "Зарегистрироваться");
  }
}

function initVerifyPage() {
  const email = pendingVerifyEmail || currentUser?.email || "";
  if (!email) { showToast("Сначала зарегистрируйтесь", "error"); loadPage("register"); return; }

  let remaining = 30;
  const timerSpan = document.getElementById("timerText");
  const resendBtn = document.getElementById("resendCodeBtn");
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!timerSpan) return;
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerSpan.innerText = "Код не пришёл?";
      resendBtn?.classList.remove("hidden");
    } else { timerSpan.innerText = `Отправить повторно через ${remaining}с`; remaining--; }
  }, 1000);

  document.querySelectorAll(".code-digit").forEach((inp, i, arr) => {
    inp.addEventListener("input",   () => { if(inp.value && arr[i+1]) arr[i+1].focus(); });
    inp.addEventListener("keydown", e  => { if(e.key==="Backspace" && !inp.value && arr[i-1]) arr[i-1].focus(); });
  });
  document.getElementById("verifySubmitBtn")?.addEventListener("click", doVerify);
  resendBtn?.addEventListener("click", resendVerificationCode);
}

async function doVerify() {
  let code = "";
  document.querySelectorAll(".code-digit").forEach(i => (code += i.value));
  if (code.length < 6) return showToast("Введите 6-значный код","error");
  const email = pendingVerifyEmail || currentUser?.email;
  if (!email) return loadPage("register");
  setLoading("verifySubmitBtn", true, "Подтвердить");
  try {
    const data = await apiFetch("/auth/verify-email",{ method:"POST", json:{ email, code } });
    saveSession(data);
    pendingVerifyEmail = "";
    localStorage.removeItem("tilzone_pending_verify_email");
    updateUIForAuth();
    showToast("Email подтверждён!"); loadPage("home");
  } catch(err) {
    showToast(err.message || "Неверный код","error");
    setLoading("verifySubmitBtn", false, "Подтвердить");
  }
}

async function resendVerificationCode() {
  const email = pendingVerifyEmail || currentUser?.email;
  if (!email) return loadPage("register");
  try {
    const data = await apiFetch("/auth/resend-verification", { method:"POST", json:{ email } });
    showToast(data.message || "Код отправлен");
    loadPage("verify");
  } catch(err) { showToast(err.message || "Не удалось отправить код", "error"); }
}

function initForgotPage() {
  document.getElementById("sendResetBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("forgotEmail")?.value.trim();
    if (!email) return showFieldError("forgotEmail","Введите email");
    setLoading("sendResetBtn", true, "Отправить ссылку");
    try {
      await apiFetch("/auth/forgot-password",{ method:"POST", json:{ email } });
      showToast("Если email зарегистрирован, письмо отправлено"); loadPage("login");
    } catch(err) { showToast(err.message,"error"); setLoading("sendResetBtn",false,"Отправить ссылку"); }
  });
  document.getElementById("backToLoginFromForgot")?.addEventListener("click", e => { e.preventDefault(); loadPage("login"); });
}

function initResetPage() {
  document.getElementById("doResetBtn")?.addEventListener("click", async () => {
    const token   = new URLSearchParams(window.location.search).get("token") || "";
    const newPass = document.getElementById("newPass")?.value;
    const confirm = document.getElementById("confirmNewPass")?.value;
    if (!newPass || newPass !== confirm) return showToast("Пароли не совпадают","error");
    if (!token) return showToast("Токен не найден","error");
    setLoading("doResetBtn",true,"Сохранить пароль");
    try {
      await apiFetch("/auth/reset-password",{ method:"POST", json:{ token, new_password:newPass, password_confirmation:confirm } });
      showToast("Пароль изменён!"); loadPage("login");
    } catch(err) { showToast(err.message,"error"); setLoading("doResetBtn",false,"Сохранить пароль"); }
  });
}

// ══════════════════════════════════════════════════════════════
//  HOME PAGE
// ══════════════════════════════════════════════════════════════

function initHomePage() {
  loadLearningPath();
  updateUIForAuth();
}

async function loadLearningPath() {
  const container  = document.getElementById("learningPathContainer");
  const scoresGrid = document.getElementById("scoresGrid");
  if (!container) return;
  try {
    const lessons = await apiFetch("/lessons");
    renderLearningPath(lessons, container);
    renderScores(lessons, scoresGrid);
    const completed = lessons.filter(l => l.completed).length;
    const total     = lessons.length;
    setElText("dailyProgress", `${completed} / ${total}`);
    setElStyle("dailyBar","width", total ? `${(completed/total)*100}%` : "0%");
  } catch {
    container.innerHTML = `<p class="text-center text-gray-400 py-8">Уроктарды жүктөө мүмкүн болгон жок. Сервер иштеп жатабы?</p>`;
  }
}

function renderLearningPath(lessons, container) {
  const statusCls = {
    completed: "bg-green-500 text-white ring-4 ring-green-200",
    available: "bg-orange-400 text-white cursor-pointer shadow-lg lesson-available",
    locked:    "bg-gray-200 text-gray-400 cursor-not-allowed",
  };
  let html = `<div class="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 min-w-max py-4 flex-wrap">`;
  lessons.forEach((lesson, idx) => {
    const icon = lesson.status==="completed" ? "✓"
               : lesson.status==="locked"    ? "🔒"
               : (lesson.icon || lesson.xp_reward);
    html += `
      <div class="flex flex-col items-center">
        <div class="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl
                    transition-all ${statusCls[lesson.status]||statusCls.locked} learning-node"
             data-lesson-id="${lesson.id}" data-status="${lesson.status}"
             title="${lesson.title}">${icon}</div>
        <span class="text-xs font-medium mt-2 text-center max-w-[80px] leading-tight">${lesson.title}</span>
        ${lesson.status==="completed"
          ? `<span class="text-[10px] text-green-600 font-semibold">✓ ${lesson.score} XP</span>`
          : `<span class="text-[10px] text-gray-400">+${lesson.xp_reward} XP</span>`}
      </div>`;
    if (idx < lessons.length - 1)
      html += `<div class="learning-line ${lesson.status==="completed"?"completed":""}"></div>`;
  });
  html += `</div>`;
  container.innerHTML = html;

  container.querySelectorAll(".learning-node").forEach(el => {
    el.addEventListener("click", () => {
      if (!currentUser) { showAuthModal(); return; }
      const s = el.dataset.status;
      if (s === "available" || s === "completed") {
        activeLessonId = parseInt(el.dataset.lessonId);
        loadPage("lesson");
      } else {
        showToast("🔒 Алгач мурунку сабакты бүтүрүңүз","warn");
      }
    });
  });
}

function renderScores(lessons, grid) {
  if (!grid) return;
  grid.innerHTML = lessons.map(l => `
    <div class="bg-white rounded-xl p-3 text-center shadow-sm score-card border border-gray-50" title="${l.title}">
      <span class="text-lg">${l.icon || "📚"}</span>
      <span class="text-[10px] text-gray-500 block truncate mt-1">${l.title}</span>
      <div class="text-lg font-bold ${l.score>0?"text-green-600":"text-gray-300"}">${l.score||0}</div>
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════
//  LESSON PAGE  — full engine
// ══════════════════════════════════════════════════════════════

async function initLessonPage() {
  if (!currentUser)    { showAuthModal(); loadPage("home"); return; }
  if (!activeLessonId) { loadPage("home"); return; }

  document.getElementById("backToHomeBtn")?.addEventListener("click", () => loadPage("home"));

  try {
    const [lesson, tasks, theory] = await Promise.all([
      apiFetch(`/lessons/${activeLessonId}`),
      apiFetch(`/lessons/${activeLessonId}/tasks`),
      apiFetch(`/lessons/${activeLessonId}/theory`).catch(() => []),
    ]);

    setElText("lessonTitle",    lesson.title);
    setElText("lessonLevel",    lesson.level);
    setElText("lessonXpReward", `+${lesson.xp_reward} XP`);

    lessonTasks  = tasks;
    taskIndex    = 0;
    taskAnswered = false;

    // Show theory panel first (if any), else go straight to tasks
    if (theory && theory.length > 0) {
      renderTheoryPanel(theory);
      showBlock("theoryPanel");
      hideBlock("progressSection");
      hideBlock("taskCard");
      hideBlock("navButtons");

      document.getElementById("startTasksBtn")?.addEventListener("click", () => {
        hideBlock("theoryPanel");
        if (!lessonTasks.length) {
          showNoTasks(lesson.id);
          return;
        }
        showBlock("progressSection");
        showBlock("taskCard");
        showBlock("navButtons");
        renderTask(0);
      });
    } else {
      hideBlock("theoryPanel");
      if (!lessonTasks.length) { showNoTasks(lesson.id); return; }
      showBlock("progressSection");
      showBlock("taskCard");
      showBlock("navButtons");
      renderTask(0);
    }

  } catch(err) {
    showToast("Сабакты жүктөө мүмкүн болгон жок","error");
    loadPage("home");
  }
}

function renderTheoryPanel(theoryList) {
  const container = document.getElementById("theoryContent");
  if (!container) return;
  container.innerHTML = theoryList.map(t => `
    <div class="bg-white rounded-xl p-4 border border-blue-100">
      <h4 class="font-bold text-blue-700 text-sm mb-2">${t.title}</h4>
      <div class="theory-content text-sm">${t.content}</div>
      ${t.examples ? `
        <div class="mt-2 text-xs text-gray-500 italic border-t border-blue-50 pt-2">
          ${t.examples.split("/").map(e => `<span class="block">▸ ${e.trim()}</span>`).join("")}
        </div>` : ""}
    </div>`).join("");
}

function showNoTasks(lessonId) {
  hideBlock("progressSection");

  const card = document.getElementById("taskCard");
  if (card) {
    card.classList.remove("hidden");
    card.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center py-8 text-center">
        <div class="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-4">
          <i class="fas fa-graduation-cap text-green-400 text-3xl"></i>
        </div>
        <p class="font-bold text-lg text-gray-700 mb-1">Теорияны окудуңуз!</p>
        <p class="text-gray-400 text-sm">Бул сабакта практикалык тапшырмалар жок.<br>Сабакты аяктап кийинкисине өтүңүз.</p>
      </div>`;
  }

  const navButtons = document.getElementById("navButtons");
  if (navButtons) navButtons.classList.remove("hidden");

  const prevBtn = document.getElementById("prevTaskBtn");
  const nextBtn = document.getElementById("nextTaskBtn");
  if (prevBtn) prevBtn.classList.add("invisible");
  if (nextBtn) nextBtn.classList.add("hidden");

  const completeBtn = document.getElementById("completeBtn");
  if (completeBtn) completeBtn.classList.remove("hidden");

  bindCompleteBtn(lessonId);
}

// ── renderTask ────────────────────────────────────────────────

function renderTask(index) {
  const task  = lessonTasks[index];
  if (!task) return;
  taskAnswered = false;

  const total = lessonTasks.length;
  setElText("taskProgressLabel", `${index + 1} / ${total}`);
  setElStyle("taskProgressBar","width", `${Math.round(((index) / total) * 100)}%`);

  // Render step dots
  const stepsEl = document.getElementById("taskSteps");
  if (stepsEl) {
    stepsEl.innerHTML = lessonTasks.map((_, i) =>
      `<div class="w-2.5 h-2.5 rounded-full transition-all duration-300 ${
        i < index  ? "bg-green-500" :
        i === index ? "bg-green-400 ring-2 ring-green-300 scale-125" :
                       "bg-gray-200"
      }"></div>`
    ).join("");
  }

  // Nav buttons
  const prevBtn     = document.getElementById("prevTaskBtn");
  const nextBtn     = document.getElementById("nextTaskBtn");
  const completeBtn = document.getElementById("completeBtn");
  prevBtn?.classList.toggle("hidden", index === 0);
  nextBtn?.classList.add("hidden");
  completeBtn?.classList.add("hidden");

  // Re-bind prev
  const prevClone = prevBtn?.cloneNode(true);
  prevBtn?.replaceWith(prevClone);
  document.getElementById("prevTaskBtn")?.addEventListener("click", () => {
    if (taskIndex > 0) { taskIndex--; renderTask(taskIndex); }
  });

  const card = document.getElementById("taskCard");
  if (!card) return;
  card.classList.add("pop-in");
  setTimeout(() => card.classList.remove("pop-in"), 400);

  if (task.task_type === "choice") {
    renderChoiceTask(card, task);
  } else if (task.task_type === "fill") {
    renderFillTask(card, task);
  } else {
    renderTranslateTask(card, task);
  }
}

// ── Choice task ───────────────────────────────────────────────

function renderChoiceTask(card, task) {
  const options = task.options || [];
  card.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">Тандоо</span>
      <span class="text-xs text-gray-400">+${task.xp_reward} XP</span>
    </div>
    <p class="text-lg font-semibold mb-5 leading-snug">${task.prompt}</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="choiceGrid">
      ${options.map((opt, i) => `
        <button class="choice-btn" data-value="${opt}" data-idx="${i}">
          <span class="inline-block w-6 h-6 rounded-full bg-gray-100 text-xs font-bold mr-2 text-center leading-6">${"ABCD"[i]}</span>${opt}
        </button>`).join("")}
    </div>
    <div id="taskFeedback" class="hidden mt-4"></div>`;

  card.querySelectorAll(".choice-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (taskAnswered) return;
      await submitTaskAnswer(task, btn.dataset.value, "choice", btn);
    });
  });
}

// ── Fill-in-blank task ────────────────────────────────────────

function renderFillTask(card, task) {
  // Replace ___ with an input
  const promptHtml = task.prompt.replace(/___+/g,
    `<input type="text" id="fillAnswer" class="fill-input inline-block w-40 mx-1 text-center"
            placeholder="..." autocomplete="off" autocorrect="off" autocapitalize="off">`);

  card.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">Толтуруу</span>
      <span class="text-xs text-gray-400">+${task.xp_reward} XP</span>
    </div>
    <p class="text-lg font-semibold mb-5 leading-snug">${promptHtml}</p>
    <button id="checkAnswerBtn"
            class="bg-green-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-green-600 transition">
      Текшерүү ✓
    </button>
    <div id="taskFeedback" class="hidden mt-4"></div>`;

  const inp = document.getElementById("fillAnswer");
  inp?.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("checkAnswerBtn")?.click(); });
  document.getElementById("checkAnswerBtn")?.addEventListener("click", async () => {
    const val = inp?.value.trim();
    if (!val) return showToast("Жооп жазыңыз","warn");
    await submitTaskAnswer(task, val, "fill", null);
  });
  inp?.focus();
}

// ── Translate task ────────────────────────────────────────────

function renderTranslateTask(card, task) {
  card.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">Котормо</span>
      <span class="text-xs text-gray-400">+${task.xp_reward} XP</span>
    </div>
    <p class="text-lg font-semibold mb-5 leading-snug">${task.prompt}</p>
    <input type="text" id="taskAnswer" placeholder="Котормону жазыңыз..."
           class="fill-input text-base"
           autocomplete="off" autocorrect="off" autocapitalize="off">
    <button id="checkAnswerBtn"
            class="mt-3 bg-green-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-green-600 transition">
      Текшерүү ✓
    </button>
    <div id="taskFeedback" class="hidden mt-4"></div>`;

  const inp = document.getElementById("taskAnswer");
  inp?.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("checkAnswerBtn")?.click(); });
  document.getElementById("checkAnswerBtn")?.addEventListener("click", async () => {
    const val = inp?.value.trim();
    if (!val) return showToast("Жооп жазыңыз","warn");
    await submitTaskAnswer(task, val, "translate", null);
  });
  inp?.focus();
}

// ── Core submit ───────────────────────────────────────────────

async function submitTaskAnswer(task, answer, type, choiceBtn) {
  if (taskAnswered) return;
  taskAnswered = true;

  // Disable inputs immediately
  document.getElementById("checkAnswerBtn")     && (document.getElementById("checkAnswerBtn").disabled = true);
  document.getElementById("taskAnswer")         && (document.getElementById("taskAnswer").disabled = true);
  document.getElementById("fillAnswer")         && (document.getElementById("fillAnswer").disabled = true);
  document.querySelectorAll(".choice-btn").forEach(b => b.disabled = true);

  try {
    const result = await apiFetch(`/lessons/tasks/${task.id}/submit`, {
      method: "POST",
      json:   { answer },
    });

    // Visual feedback
    if (type === "choice" && choiceBtn) {
      if (result.correct) {
        choiceBtn.classList.add("correct");
      } else {
        choiceBtn.classList.add("wrong");
        // Highlight correct answer
        document.querySelectorAll(".choice-btn").forEach(b => {
          if (b.dataset.value.toLowerCase().trim() === result.expected.toLowerCase().trim()) {
            b.classList.add("reveal");
          }
        });
      }
    }

    if (type === "fill") {
      const inp = document.getElementById("fillAnswer");
      inp?.classList.add(result.correct ? "correct" : "wrong");
    }

    if (type === "translate") {
      const inp = document.getElementById("taskAnswer");
      inp?.classList.add(result.correct ? "correct" : "wrong");
    }

    // Feedback banner
    const fb = document.getElementById("taskFeedback");
    if (fb) {
      fb.className = result.correct ? "feedback-correct mt-4" : "feedback-wrong mt-4";
      const hint = result.explanation || task.hint;
      fb.innerHTML = result.correct
        ? `✅ Туура! ${result.earned_xp > 0 ? `<span class="font-black">+${result.earned_xp} XP</span>` : ""}`
        : `❌ Туура эмес. Туура жооп: <b>${result.expected}</b>${hint ? `<br><span class="text-xs opacity-80 mt-1 block">💡 ${hint}</span>` : ""}`;
      fb.classList.remove("hidden");
    }

    // Update XP
    if (result.earned_xp > 0 && currentUser) {
      currentUser.xp    = (currentUser.xp || 0) + result.earned_xp;
      currentUser.level = Math.floor(currentUser.xp / 100) + 1;
      localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
      updateUIForAuth();
      showToast(`+${result.earned_xp} XP!`);
    }

    // After short delay, show nav
    setTimeout(() => {
      const isLast = taskIndex >= lessonTasks.length - 1;
      if (isLast) {
        // Update progress bar to 100%
        setElStyle("taskProgressBar","width","100%");
        setElText("taskProgressLabel", `${lessonTasks.length} / ${lessonTasks.length}`);
        showBlock("completeBtn");
        bindCompleteBtn(activeLessonId);
      } else {
        const nextBtn = document.getElementById("nextTaskBtn");
        nextBtn?.classList.remove("hidden");
        const clone = nextBtn?.cloneNode(true);
        nextBtn?.replaceWith(clone);
        document.getElementById("nextTaskBtn")?.addEventListener("click", () => {
          taskIndex++;
          renderTask(taskIndex);
        });
      }
    }, result.correct ? 600 : 1200);

  } catch(err) {
    taskAnswered = false;
    // Re-enable inputs on error
    document.getElementById("checkAnswerBtn")   && (document.getElementById("checkAnswerBtn").disabled = false);
    document.getElementById("taskAnswer")       && (document.getElementById("taskAnswer").disabled = false);
    document.getElementById("fillAnswer")       && (document.getElementById("fillAnswer").disabled = false);
    document.querySelectorAll(".choice-btn").forEach(b => b.disabled = false);
    showToast(err.message || "Жооп текшерилбеди","error");
  }
}

function bindCompleteBtn(lessonId) {
  const btn = document.getElementById("completeBtn");
  if (!btn) return;
  const clone = btn.cloneNode(true);
  btn.replaceWith(clone);
  document.getElementById("completeBtn")?.addEventListener("click", async () => {
    if (!currentUser) { showAuthModal(); return; }
    try {
      const result = await apiFetch(`/lessons/${lessonId}/complete`,{ method:"POST" });
      showToast(result.earned_xp > 0
        ? `🏁 Сабак бүттү! +${result.earned_xp} XP 🎉`
        : "✅ Сабак мурунтан эле бүтүрүлгөн");
      if (currentUser) {
        currentUser.xp     = result.total_xp;
        currentUser.level  = result.level;
        currentUser.streak = result.streak;
        localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
      }
      updateUIForAuth();
      loadPage("home");
    } catch(err) { showToast(err.message,"error"); }
  });
}

// ══════════════════════════════════════════════════════════════
//  THEORY PAGE — loads from API
// ══════════════════════════════════════════════════════════════

async function initTheoryPage() {
  showBlock("theoryLoading");
  hideBlock("theoryGrid");
  hideBlock("theoryEmpty");

  try {
    allTheoryCards = await apiFetch("/theory");
    renderTheoryFilters();
    renderTheoryGrid(allTheoryCards);
  } catch {
    document.getElementById("theoryLoading").innerHTML = `
      <p class="text-red-400">Теорияны жүктөө мүмкүн болгон жок</p>`;
  }

  // Modal close (two buttons + backdrop)
  ["closeTheoryModal", "closeTheoryModal2"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => hideEl("theoryModal"));
  });
  document.getElementById("theoryModal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("theoryModal")) hideEl("theoryModal");
  });

  // Live search
  document.getElementById("theorySearch")?.addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = allTheoryCards.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.content.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
    renderTheoryGrid(filtered);
  });
}

const CATEGORY_META = {
  tenses:        { label: "Чактар",       icon: "⏰" },
  articles:      { label: "Артикль",       icon: "🅰️" },
  verbs:         { label: "Этиштер",       icon: "⚡" },
  pronouns:      { label: "Алмаш.",        icon: "👤" },
  phrases:       { label: "Сүйлөмдөр",    icon: "💬" },
  pronunciation: { label: "Айтылыш",       icon: "🔊" },
};

function renderTheoryFilters() {
  const container = document.getElementById("categoryFilters");
  if (!container) return;

  const cats = [...new Set(allTheoryCards.map(c => c.category))];
  const extra = cats.map(cat => {
    const meta = CATEGORY_META[cat] || { label: cat, icon: "📖" };
    return `<button data-cat="${cat}"
              class="cat-filter px-4 py-1.5 rounded-full text-sm font-medium border transition">
              ${meta.icon} ${meta.label}
            </button>`;
  }).join("");
  container.innerHTML = `
    <button data-cat="" class="cat-filter active px-4 py-1.5 rounded-full text-sm font-medium border border-green-500 bg-green-500 text-white transition">
      Баары
    </button>` + extra;

  container.querySelectorAll(".cat-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      activeTheoryCat = btn.dataset.cat;
      container.querySelectorAll(".cat-filter").forEach(b => b.classList.remove("active","bg-green-500","text-white","border-green-500"));
      btn.classList.add("active","bg-green-500","text-white","border-green-500");
      const filtered = activeTheoryCat
        ? allTheoryCards.filter(c => c.category === activeTheoryCat)
        : allTheoryCards;
      renderTheoryGrid(filtered);
    });
  });
}

function renderTheoryGrid(cards) {
  hideBlock("theoryLoading");
  const grid  = document.getElementById("theoryGrid");
  const empty = document.getElementById("theoryEmpty");
  if (!grid) return;

  if (!cards.length) {
    hideBlock("theoryGrid");
    showBlock("theoryEmpty");
    return;
  }

  showBlock("theoryGrid");
  hideBlock("theoryEmpty");

  const CAT_COLORS = {
    tenses:        "bg-blue-50   border-blue-100   text-blue-800",
    articles:      "bg-amber-50  border-amber-100  text-amber-800",
    verbs:         "bg-purple-50 border-purple-100 text-purple-800",
    pronouns:      "bg-pink-50   border-pink-100   text-pink-800",
    phrases:       "bg-green-50  border-green-100  text-green-800",
    pronunciation: "bg-teal-50   border-teal-100   text-teal-800",
  };

  grid.innerHTML = cards.map(card => {
    const meta  = CATEGORY_META[card.category] || { label: card.category, icon: "📖" };
    const color = CAT_COLORS[card.category]    || "bg-gray-50 border-gray-100 text-gray-800";
    const preview = card.content.replace(/<[^>]+>/g, "").substring(0, 90) + "…";
    return `
      <div class="theory-card bg-white rounded-2xl p-5 shadow-sm cursor-pointer border"
           data-id="${card.id}">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-2xl">${meta.icon}</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${color}">${meta.label}</span>
        </div>
        <h3 class="font-bold text-base mb-1 leading-tight">${card.title}</h3>
        <p class="text-xs text-gray-400 leading-relaxed">${preview}</p>
      </div>`;
  }).join("");

  grid.querySelectorAll(".theory-card").forEach(el => {
    el.addEventListener("click", () => {
      const card = cards.find(c => c.id === parseInt(el.dataset.id));
      if (card) openTheoryModal(card);
    });
  });
}

function openTheoryModal(card) {
  const meta = CATEGORY_META[card.category] || { icon: "📖", label: card.category };
  document.getElementById("theoryModalTitle").innerHTML = `${meta.icon} ${card.title}`;
  document.getElementById("theoryModalBody").innerHTML  = card.content;

  const exBox  = document.getElementById("theoryModalExamples");
  const exText = document.getElementById("theoryModalExamplesText");
  if (card.examples && card.examples.trim()) {
    exText.innerHTML = card.examples.split("/").map(e => `<p>▸ ${e.trim()}</p>`).join("");
    showBlock("theoryModalExamples");
  } else {
    hideBlock("theoryModalExamples");
  }

  showEl("theoryModal");
}

// ══════════════════════════════════════════════════════════════
//  MVP PAGE
// ══════════════════════════════════════════════════════════════

function initPvPPage() {
  const div = document.getElementById("pvpCard");
  if (!div) return;

  let ws = null;
  let roomId = null;
  let answered = false;
  let startTime = null;
  let timerInterval = null;
  const myUserId = currentUser?.id;

  renderLobby();

  function renderLobby() {
    div.innerHTML = `
      <div class="text-center py-4">
        <div class="text-6xl mb-4">⚔️</div>
        <h2 class="text-2xl font-bold mb-2">PvP Режим</h2>
        <p class="text-gray-500 mb-6">Сразись с другим игроком — кто быстрее переведёт слово</p>
        <button id="findBtn" class="bg-green-500 text-white px-10 py-3 rounded-full text-lg font-semibold hover:bg-green-600 transition">
          🔍 Найти соперника
        </button>
      </div>`;

    div.querySelector("#findBtn").addEventListener("click", () => {
      if (!currentUser) { showAuthModal(); return; }
      connectWS();
    });
  }

  function connectWS() {
    div.innerHTML = `
      <div class="text-center py-8">
        <i class="fas fa-spinner fa-spin text-4xl text-green-500 mb-4"></i>
        <p class="text-lg animate-pulse">🔍 Ищем соперника...</p>
        <button id="cancelBtn" class="mt-6 text-gray-400 text-sm underline">Отмена</button>
      </div>`;

    div.querySelector("#cancelBtn").addEventListener("click", () => {
      ws?.close();
      renderLobby();
    });

    const token = localStorage.getItem("tilzone_access_token");
    console.log("token:", token); // посмотрим что там
    if (!token) {
      showError("Необходимо войти в аккаунт");
    return;
}
    const wsUrl = `ws://localhost:8000/pvp/ws?token=${token}`;

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      showError("Не удалось подключиться к серверу");
      return;
    }

    ws.onopen = () => console.log("WS connected");

    ws.onmessage = ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      if (msg.type === "waiting") {
        // уже показан спиннер, ничего не делаем
      }
      if (msg.type === "match_found") {
        roomId = msg.room_id;
        answered = false;
        startTime = Date.now();
        ws.send(JSON.stringify({ type: "join_room", room_id: roomId }));
        renderQuestion(msg.question, msg.options);
      }
      if (msg.type === "answer_result") {
        markAnswered(msg.correct);
        clearInterval(timerInterval);
      }
      if (msg.type === "round_end") {
        renderResult(msg);
      }
    };

    ws.onerror = () => showError("Ошибка соединения. Проверь что сервер запущен.");
    ws.onclose = () => {
      clearInterval(timerInterval);
    };
  }

  function renderQuestion(word, options) {
    div.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">⚔️ Переведи слово</h2>
        <span id="timer" class="text-2xl font-mono font-bold text-red-500">10</span>
      </div>
      <p class="text-center text-3xl font-bold mb-6">${word}</p>
      <div class="flex gap-3 justify-center flex-wrap" id="options"></div>
      <p id="status" class="mt-4 text-center text-sm text-gray-400">Соперник думает...</p>`;

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "pvp-btn bg-gray-50 px-6 py-3 rounded-xl border-2 border-transparent hover:bg-gray-100 transition text-lg";
      btn.textContent = opt;
      btn.addEventListener("click", () => sendAnswer(opt));
      div.querySelector("#options").appendChild(btn);
    });

    let t = 10;
    const timerEl = div.querySelector("#timer");
    timerInterval = setInterval(() => {
      t--;
      if (timerEl) timerEl.textContent = t;
      if (t <= 0) {
        clearInterval(timerInterval);
        if (!answered) sendAnswer("__timeout__");
      }
    }, 1000);
  }

  function sendAnswer(answer) {
    if (answered) return;
    answered = true;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    ws.send(JSON.stringify({ type: "answer", answer, elapsed }));
    div.querySelectorAll(".pvp-btn").forEach(b => b.disabled = true);
    const status = div.querySelector("#status");
    if (status) status.textContent = `⏱ Ты ответил за ${elapsed}с. Ждём соперника...`;
  }

  function markAnswered(correct) {
    if (typeof showToast === "function") {
      showToast(correct ? "✅ Верно! +40 XP" : "❌ Неверно", correct ? "success" : "error");
    }
  }

  function renderResult(msg) {
    const iWon = msg.winner_id === myUserId;
    const me    = msg.p1.user_id === myUserId ? msg.p1 : msg.p2;
    const enemy = msg.p1.user_id === myUserId ? msg.p2 : msg.p1;

    div.innerHTML = `
      <div class="text-center">
        <div class="text-6xl mb-3">${iWon ? "🏆" : "😔"}</div>
        <h2 class="text-2xl font-bold mb-4">${iWon ? "Победа! +40 XP" : "Поражение"}</h2>
        <div class="grid grid-cols-2 gap-4 my-4 text-sm">
          <div class="bg-green-50 rounded-xl p-4">
            <p class="font-bold mb-1">Ты</p>
            <p class="text-lg">${me.correct ? "✅" : "❌"} ${me.time.toFixed(2)}с</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4">
            <p class="font-bold mb-1">Соперник</p>
            <p class="text-lg">${enemy.correct ? "✅" : "❌"} ${enemy.time.toFixed(2)}с</p>
          </div>
        </div>
        <button id="playAgainBtn" class="mt-2 bg-purple-500 text-white px-8 py-3 rounded-full hover:bg-purple-600 transition">
          Сыграть ещё ➜
        </button>
      </div>`;

    div.querySelector("#playAgainBtn").addEventListener("click", () => {
      ws?.close();
      renderLobby();
    });
  }

  function showError(msg) {
    div.innerHTML = `
      <div class="text-center py-8">
        <div class="text-5xl mb-4">⚠️</div>
        <p class="text-red-500 mb-4">${msg}</p>
        <button id="retryBtn" class="bg-green-500 text-white px-8 py-3 rounded-full hover:bg-green-600 transition">
          Попробовать снова
        </button>
      </div>`;
    div.querySelector("#retryBtn").addEventListener("click", renderLobby);
  }
}

// ══════════════════════════════════════════════════════════════
//  AI PAGE
// ══════════════════════════════════════════════════════════════

function initAIPage() {
  sessionErrors = [];
  renderAIScenarios();
  renderHistoryPanel();
  setElText("chatScenarioTitle", currentScenario.name);
  document.getElementById("sendChatBtn")?.addEventListener("click", sendAIMessage);
  document.getElementById("chatInput")?.addEventListener("keydown", e => { if (e.key === "Enter") sendAIMessage(); });
  document.getElementById("voiceBtn")?.addEventListener("click", () => showToast("🎤 Үн киргизүү жакында болот", "info"));
  document.getElementById("clearChatBtn")?.addEventListener("click", () => {
    chatHistory = [...currentScenario.dialog];
    sessionErrors = [];
    hideBlock("errorAnalysisBar");
    renderChat();
    renderHistoryPanel();
  });
  document.getElementById("loadHistoryBtn")?.addEventListener("click", loadAIHistory);
  renderLevelHints();
}

async function sendAIMessage() {
  if (!currentUser) { showAuthModal(); return; }
  const inp  = document.getElementById("chatInput");
  const text = inp?.value.trim();
  if (!text) return;
  chatHistory.push({ role: "user", text });
  inp.value = "";
  chatHistory.push({ role: "assistant", text: "...", typing: true });
  renderChat();

  const historyForApi = chatHistory
    .filter(m => !m.typing && !m.correction && (m.role === "user" || m.role === "assistant"))
    .slice(-20).slice(0, -1)
    .map(m => ({ role: m.role, content: m.text }));

  try {
    const data = await apiFetch("/ai/chat", {
      method: "POST",
      json: { message: text, scenario: currentScenario.name, history: historyForApi },
    });
    chatHistory = chatHistory.filter(m => !m.typing);
    chatHistory.push({ role: "assistant", text: data.response });
    if (data.correction) {
      chatHistory.push({ role: "assistant", text: `✏️ ${data.correction}`, correction: true });
      sessionErrors.push({ original: text, corrected: data.correction });
      const bar = document.getElementById("errorAnalysisBar");
      const txt = document.getElementById("errorAnalysisText");
      if (bar && txt) { txt.innerText = data.correction; bar.classList.remove("hidden"); }
    }
    if (data.level_hint) {
      const badge = document.getElementById("aiLevelBadge");
      if (badge) { badge.innerText = data.level_hint; badge.classList.remove("hidden"); }
    }
    if (data.earned_xp > 0 && currentUser) {
      currentUser.xp    = (currentUser.xp || 0) + data.earned_xp;
      currentUser.level = Math.floor(currentUser.xp / 100) + 1;
      localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
      updateUIForAuth();
      showToast(`+${data.earned_xp} XP!`);
    }
    renderHistoryPanel();
  } catch(err) {
    chatHistory = chatHistory.filter(m => !m.typing);
    const msg = err.status === 503
  ? "⚠️ AI убактылуу жеткиликсиз. Кийинчерээк аракет кылыңыз."
  : "⚠️ Сервер менен байланыш катасы.";
    chatHistory.push({ role: "assistant", text: msg, error: true });
  }
  renderChat();
}

function renderAIScenarios() {
  const div = document.getElementById("scenarioList");
  if (!div) return;
  div.innerHTML = aiScenarios.map(s => `
    <div class="p-2 rounded-xl hover:bg-green-50 cursor-pointer scenario-item text-sm
                ${s.id === currentScenario.id ? "bg-green-50 text-green-700 font-medium" : ""}"
         data-id="${s.id}">${s.name}</div>`).join("");
  div.querySelectorAll(".scenario-item").forEach(el => {
    el.addEventListener("click", () => {
      currentScenario = aiScenarios.find(s => s.id === parseInt(el.dataset.id));
      chatHistory     = [...currentScenario.dialog];
      sessionErrors   = [];
      setElText("chatScenarioTitle", currentScenario.name);
      renderAIScenarios(); renderChat(); renderHistoryPanel();
    });
  });
  renderChat();
}

function renderChat() {
  const chatDiv = document.getElementById("chatMessages");
  if (!chatDiv) return;
  chatDiv.innerHTML = chatHistory.map(msg => {
    const isUser = msg.role === "user";
    const cls = msg.typing     ? "bg-gray-100 italic text-gray-400 animate-pulse"
              : msg.error      ? "bg-red-50 text-red-600 border border-red-200"
              : isUser         ? "bg-green-500 text-white"
              : msg.correction ? "bg-amber-50 border border-amber-200 text-amber-800 text-xs"
              : "bg-gray-100 text-gray-800";
    return `<div class="flex ${isUser ? "justify-end" : "justify-start"}">
      <div class="max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${cls}">${msg.text}</div>
    </div>`;
  }).join("");
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function renderHistoryPanel() {
  const el = document.getElementById("historyList");
  if (!el) return;
  const msgs = chatHistory.filter(m => m.role === "user" && !m.typing).slice(-6);
  if (!msgs.length) { el.innerHTML = `<p class="text-gray-400 text-xs italic">Азырынча бош</p>`; return; }
  el.innerHTML = msgs.map(m => `<div class="truncate text-xs text-gray-500 py-0.5">— ${m.text}</div>`).join("");
}

async function loadAIHistory() {
  const el = document.getElementById("historyList");
  if (!el) return;
  if (!currentUser) { el.innerHTML = `<p class="text-xs text-gray-400 italic">Кирүү керек</p>`; return; }
  el.innerHTML = `<i class="fas fa-spinner fa-spin text-green-400"></i>`;
  try {
    const items = await apiFetch("/ai/history?limit=10");
    if (!items?.length) { el.innerHTML = `<p class="text-xs text-gray-400 italic">Тарых бош</p>`; return; }
    el.innerHTML = items.map(item => `
      <div class="text-xs border rounded-xl p-2 hover:bg-gray-50 cursor-pointer history-item"
           data-response="${encodeURIComponent(item.response)}">
        <p class="font-medium text-gray-600 truncate">${item.scenario}</p>
        <p class="text-gray-400 truncate mt-0.5">— ${item.message}</p>
      </div>`).join("");
    el.querySelectorAll(".history-item").forEach(item => {
      item.addEventListener("click", () => {
        chatHistory.push({ role: "assistant", text: `📖 ${decodeURIComponent(item.dataset.response)}` });
        renderChat();
      });
    });
  } catch { el.innerHTML = `<p class="text-xs text-red-400">Тарыхты жүктөө катасы</p>`; }
}

function renderLevelHints() {
  const el = document.getElementById("levelHints");
  if (!el) return;
  const xp    = currentUser?.xp || 0;
  const level = xp < 100 ? "A1" : xp < 300 ? "A2" : xp < 700 ? "B1" : xp < 1500 ? "B2" : "C1";
  const hints = {
    A1: ["Баштаңыз: Hello! / Good morning!", "Суроо: What is your name?", "Жооп: My name is ..."],
    A2: ["Колдонуңуз: Can I have...?", "Суроо: How much does it cost?", "Айтыңыз: I would like to..."],
    B1: ["Өзүңүз жөнүндө кеңири айтыңыз", "Өткөн чакты колдонуңуз", "Суроо: What do you think?"],
    B2: ["Идиомаларды колдонуңуз", "Пикириңизди далилдеңиз", "Кеңейтилген сүйлөмдөр айтыңыз"],
    C1: ["Абстрактуу темаларды талкуулаңыз", "Шарттуу ырайым колдонуңуз", "Татаал сүйлөмдөр куруңуз"],
  };
  el.innerHTML = `
    <p class="text-xs font-semibold text-green-600 mb-2">Деңгээл: ${level}</p>
    ${(hints[level]||hints.A1).map(h => `<p class="text-xs text-gray-500">• ${h}</p>`).join("")}`;
}

// ══════════════════════════════════════════════════════════════
//  PROFILE PAGE
// ══════════════════════════════════════════════════════════════

function initProfilePage() {
  if (!currentUser) { showAuthModal(); loadPage("home"); return; }
  updateUIForAuth();
  renderAvatar();
  showProfileTab(currentProfileTab);
  document.querySelectorAll(".profile-tab").forEach(btn => {
    btn.addEventListener("click", () => showProfileTab(btn.dataset.tab));
  });
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    logout(); updateUIForAuth(); loadPage("home");
  });
  document.getElementById("avatarInput")?.addEventListener("change", uploadAvatar);
}

function renderAvatar() {
  const wrapper = document.getElementById("avatarWrapper");
  if (!wrapper) return;
  if (currentUser?.avatar) {
    wrapper.innerHTML = `<img src="http://localhost:8000${currentUser.avatar}" class="w-full h-full object-cover rounded-full" alt="avatar">`;
  }
}

async function uploadAvatar(e) {
  const file   = e.target.files?.[0];
  if (!file) return;
  const loader = document.getElementById("avatarLoader");
  loader?.classList.remove("hidden");
  try {
    const fd = new FormData();
    fd.append("file", file);
    const data = await apiUpload("/user/avatar", fd);
    currentUser = data;
    localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
    renderAvatar(); updateUIForAuth();
    showToast("Аватар жаңыланды!");
  } catch(err) { showToast(err.message||"Жүктөө катасы","error"); }
  finally      { loader?.classList.add("hidden"); }
}

function showProfileTab(tab) {
  currentProfileTab = tab;
  document.querySelectorAll(".profile-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab===tab));
  const content = document.getElementById("profileTabContent");
  if (!content) return;

  if (tab === "stats") {
    content.innerHTML = `
      <h3 class="text-xl font-bold mb-4">📊 Статистика</h3>
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-green-50  p-4 rounded-xl"><p class="text-xs text-gray-500">Жалпы XP</p>  <p class="text-2xl font-black text-green-700">${currentUser?.xp||0}</p></div>
        <div class="bg-orange-50 p-4 rounded-xl"><p class="text-xs text-gray-500">Стрик</p>     <p class="text-2xl font-black text-orange-600">${currentUser?.streak||0} күн</p></div>
        <div class="bg-blue-50   p-4 rounded-xl"><p class="text-xs text-gray-500">PvP жеңиш</p><p class="text-2xl font-black text-blue-600">${currentUser?.pvp_wins||0}</p></div>
        <div class="bg-purple-50 p-4 rounded-xl"><p class="text-xs text-gray-500">ELO</p>       <p class="text-2xl font-black text-purple-600">${currentUser?.elo||1000}</p></div>
        <div class="bg-amber-50  p-4 rounded-xl"><p class="text-xs text-gray-500">Деңгээл</p>  <p class="text-2xl font-black text-amber-600">${currentUser?.level||1}</p></div>
        <div class="bg-gray-50   p-4 rounded-xl"><p class="text-xs text-gray-500">Лига</p>     <p class="text-2xl font-black">${currentUser?.league||"Bronze"}</p></div>
      </div>`;
  } else if (tab === "edit") {
    content.innerHTML = `
      <h3 class="text-xl font-bold mb-4">✏️ Профилди өзгөртүү</h3>
      <div class="space-y-4 max-w-sm">
        <div><label class="text-sm font-medium text-gray-700 block mb-1">Ат</label>
          <input type="text" id="editName" value="${currentUser?.name||""}" class="w-full border rounded-xl p-3 focus:border-green-400 focus:outline-none"></div>
        <div><label class="text-sm font-medium text-gray-700 block mb-1">Username</label>
          <input type="text" id="editUsername" value="${currentUser?.username||""}" class="w-full border rounded-xl p-3 focus:border-green-400 focus:outline-none"></div>
        <div><label class="text-sm font-medium text-gray-700 block mb-1">Эне тили</label>
          <select id="editNativeLang" class="w-full border rounded-xl p-3 focus:border-green-400 focus:outline-none">
            <option value="ky" ${currentUser?.native_language==="ky"?"selected":""}>🇰🇬 Кыргызча</option>
            <option value="ru" ${currentUser?.native_language==="ru"?"selected":""}>🇷🇺 Орусча</option>
            <option value="en" ${currentUser?.native_language==="en"?"selected":""}>🇬🇧 English</option>
          </select></div>
        <div><label class="text-sm font-medium text-gray-700 block mb-1">Үйрөнүүчү тил</label>
          <select id="editStudyLang" class="w-full border rounded-xl p-3 focus:border-green-400 focus:outline-none">
            <option value="ky" ${currentUser?.study_language==="ky"?"selected":""}>🇰🇬 Кыргызча</option>
            <option value="ru" ${currentUser?.study_language==="ru"?"selected":""}>🇷🇺 Орусча</option>
            <option value="en" ${currentUser?.study_language==="en"?"selected":""}>🇬🇧 English</option>
          </select></div>
        <button id="saveProfileBtn" class="w-full bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600 transition">
          Өзгөртүүлөрдү сактоо
        </button>
      </div>`;
    document.getElementById("saveProfileBtn")?.addEventListener("click", saveProfile);
  } else if (tab === "achievements") {
    const achv = [
      ["fas fa-medal text-amber-500",    "bg-amber-50",  "5-күндүк стрик",  "+50 XP",  (currentUser?.streak||0)>=5],
      ["fas fa-chart-line text-blue-500","bg-blue-50",   "100 XP жыйналды", "+20 XP",  (currentUser?.xp||0)>=100],
      ["fas fa-brain text-purple-500",   "bg-purple-50", "10 сабак катары", "+100 XP", false],
      ["fas fa-globe text-green-500",    "bg-green-50",  "50 сөз үйрөндү",  "+75 XP",  false],
      ["fas fa-fist-raised text-red-500","bg-red-50",    "Биринчи PvP жеңиш","+30 XP", (currentUser?.pvp_wins||0)>=1],
      ["fas fa-fire text-orange-500",    "bg-orange-50", "30 күндүк стрик", "+200 XP", (currentUser?.streak||0)>=30],
    ];
    content.innerHTML = `
      <h3 class="text-xl font-bold mb-4">🏅 Жетишкендиктер</h3>
      <div class="grid grid-cols-2 gap-4">
        ${achv.map(([icon,bg,title,reward,unlocked]) => `
          <div class="${bg} p-4 rounded-xl text-center ${unlocked?"":"opacity-40 grayscale"}">
            <i class="${icon} text-3xl mb-2"></i>
            <p class="font-medium text-sm">${title}</p>
            <span class="text-xs text-gray-500">${reward}</span>
            ${unlocked ? '<p class="text-xs text-green-600 mt-1">✓ Алынды</p>' : ""}
          </div>`).join("")}
      </div>`;
  } else if (tab === "rating") {
    content.innerHTML = `
      <div class="flex gap-3 mb-4 border-b pb-2">
        ${["global","pvp"].map(s => `
          <button data-rating-subtab="${s}"
                  class="rating-subtab px-4 py-2 rounded-full text-sm font-medium transition
                  ${currentRatingSubtab===s?"bg-green-500 text-white":"bg-gray-100 hover:bg-gray-200"}">
            ${s==="global"?"🌍 XP боюнча":"⚔️ ELO боюнча"}
          </button>`).join("")}
      </div>
      <div id="ratingList"><div class="text-center py-6"><i class="fas fa-spinner fa-spin text-green-500 text-2xl"></i></div></div>`;
    document.querySelectorAll(".rating-subtab").forEach(btn => {
      btn.addEventListener("click", () => { currentRatingSubtab = btn.dataset.ratingSubtab; showProfileTab("rating"); });
    });
    loadLeaderboard(currentRatingSubtab);
  } else if (tab === "settings") {
    content.innerHTML = `
      <h3 class="text-xl font-bold mb-4">⚙️ Орнотуулар</h3>
      <div class="space-y-5 max-w-sm">
        <div class="text-sm text-gray-500 space-y-1">
          <p>Email: <span class="font-medium text-gray-700">${currentUser?.email||""}</span></p>
          <p>Верификация: <span class="font-medium ${currentUser?.is_verified?"text-green-600":"text-red-500"}">${currentUser?.is_verified?"✓ Ооба":"✗ Жок"}</span></p>
        </div>
        <hr>
        <button id="deleteAvatarBtn" class="text-sm text-red-500 hover:underline flex items-center gap-1">
          <i class="fas fa-trash-alt"></i> Аватарды өчүрүү
        </button>
      </div>`;
    document.getElementById("deleteAvatarBtn")?.addEventListener("click", async () => {
      try {
        const data = await apiFetch("/user/avatar",{ method:"DELETE" });
        currentUser = data;
        localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
        renderAvatar(); updateUIForAuth();
        showToast("Аватар өчүрүлдү");
      } catch(err) { showToast(err.message,"error"); }
    });
  }
}

async function saveProfile() {
  const name            = document.getElementById("editName")?.value.trim();
  const username        = document.getElementById("editUsername")?.value.trim();
  const native_language = document.getElementById("editNativeLang")?.value;
  const study_language  = document.getElementById("editStudyLang")?.value;
  if (!name)     return showFieldError("editName","Атыңызды жазыңыз");
  if (!username) return showFieldError("editUsername","Username жазыңыз");
  setLoading("saveProfileBtn",true,"Сактоо...");
  try {
    const data = await apiFetch("/user/profile",{ method:"PATCH", json:{ name, username, native_language, study_language } });
    currentUser = data;
    localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
    currentStudyLang = study_language;
    localStorage.setItem("tilzone_study_lang", currentStudyLang);
    updateUIForAuth();
    showToast("Профиль жаңыланды!");
  } catch(err) { showToast(err.message,"error"); }
  finally       { setLoading("saveProfileBtn",false,"Өзгөртүүлөрдү сактоо"); }
}

// ══════════════════════════════════════════════════════════════
//  LEADERBOARD
// ══════════════════════════════════════════════════════════════

async function loadLeaderboard(subtab = "global") {
  const container = document.getElementById("ratingList");
  if (!container) return;
  container.innerHTML = `<div class="text-center py-6"><i class="fas fa-spinner fa-spin text-green-500 text-2xl"></i></div>`;
  try {
    const by   = subtab === "pvp" ? "pvp" : "xp";
    const data = await apiFetch(`/leaderboard?by=${by}&limit=20`);
    const { entries, my_rank } = data;
    if (!entries?.length) { container.innerHTML = `<p class="text-center text-gray-400 py-6">Азырынча эч ким жок</p>`; return; }
    const medals = ["🥇","🥈","🥉"];
    container.innerHTML = `
      <div class="space-y-1">
        ${entries.map(e => `
          <div class="flex items-center gap-3 p-3 rounded-xl ${e.is_me?"bg-green-50 ring-2 ring-green-300":"hover:bg-gray-50"} transition">
            <span class="w-8 text-center font-bold text-lg">${medals[e.rank-1]||e.rank}</span>
            <div class="w-9 h-9 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
              ${e.avatar
                ? `<img src="http://localhost:8000${e.avatar}" class="w-full h-full object-cover">`
                : `<i class="fas fa-user text-gray-400 text-sm"></i>`}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-sm truncate">${e.name}${e.is_me?" <span class='text-green-600 text-xs'>(сиз)</span>":""}</p>
              <p class="text-xs text-gray-400">@${e.username} · ${e.league}</p>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="font-bold text-sm ${e.is_me?"text-green-600":""}">
                ${subtab==="pvp" ? e.elo+" ELO" : e.xp+" XP"}
              </p>
              <p class="text-xs text-gray-400">
                ${subtab==="pvp" ? e.pvp_wins+"W / "+e.pvp_losses+"L" : "Ур. "+e.level}
              </p>
            </div>
          </div>`).join("")}
        ${my_rank ? `<div class="mt-3 pt-3 border-t text-center text-sm text-gray-500">
          Сиздин орун: <span class="font-bold text-green-600">#${my_rank}</span>
        </div>` : ""}
      </div>`;
  } catch { container.innerHTML = `<p class="text-center text-red-400 py-6">Рейтингди жүктөө катасы</p>`; }
}

// ══════════════════════════════════════════════════════════════
//  SPA ROUTER
// ══════════════════════════════════════════════════════════════

const PAGE_INIT_MAP = {
  home:     initHomePage,
  login:    initLoginPage,
  register: initRegisterPage,
  verify:   initVerifyPage,
  forgot:   initForgotPage,
  reset:    initResetPage,
  profile:  initProfilePage,
  lesson:   initLessonPage,
  ai:       initAIPage,
  theory:   initTheoryPage,
  mvp:      initPvPPage,
};

async function loadPage(pageName) {
  const container = document.querySelector("#app-content .container-custom");
  if (!container) return;
  container.innerHTML = `<div class="text-center py-20"><i class="fas fa-spinner fa-spin text-5xl text-green-500 mb-4"></i></div>`;
  try {
    const res = await fetch(`pages/${pageName}.html`);
    if (!res.ok) throw new Error();
    container.innerHTML = await res.text();
  } catch {
    container.innerHTML = `<div class="text-center py-20">
      <i class="fas fa-exclamation-triangle text-6xl text-red-400 mb-4"></i>
      <h1 class="text-2xl font-bold">Барак табылган жок</h1>
      <a href="#" data-page="home" class="mt-4 inline-block bg-green-500 text-white px-6 py-2 rounded-xl">Башкы бетке</a>
    </div>`;
    attachNavLinks(); return;
  }
  PAGE_INIT_MAP[pageName]?.();
  applyUILanguage(currentLang);
  document.querySelectorAll(".nav-link, .bottom-nav-item").forEach(link => {
    const active = link.dataset.page === pageName;
    link.classList.toggle("active",         active);
    link.classList.toggle("bg-green-50",    active);
    link.classList.toggle("text-green-600", active);
  });
  currentPage = pageName;
  history.pushState({ page: pageName }, "", `#${pageName}`);
}

function attachNavLinks() {
  document.querySelectorAll(".nav-link, .bottom-nav-item").forEach(link => {
    const clone = link.cloneNode(true);
    link.replaceWith(clone);
  });
  document.querySelectorAll(".nav-link, .bottom-nav-item").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const page = link.dataset.page;
      if (!page) return;
      if (page === "profile" && !currentUser) { showAuthModal(); return; }
      loadPage(page);
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  applyUILanguage(currentLang);
  attachNavLinks();

  document.getElementById("modalLoginBtn")?.addEventListener("click",    () => { hideAuthModal(); loadPage("login");    });
  document.getElementById("modalRegisterBtn")?.addEventListener("click", () => { hideAuthModal(); loadPage("register"); });

  document.getElementById("langBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("langDropdown")?.classList.toggle("hidden");
  });
  document.querySelectorAll(".lang-option").forEach(opt => {
    opt.addEventListener("click", () => {
      applyUILanguage(opt.dataset.lang);
      document.getElementById("langDropdown")?.classList.add("hidden");
      loadPage(currentPage);
    });
  });
  document.addEventListener("click", () => document.getElementById("langDropdown")?.classList.add("hidden"));
  window.addEventListener("popstate", e => loadPage(e.state?.page || "home"));

  loadPage(window.location.hash.slice(1) || "home");
  updateUIForAuth();
});