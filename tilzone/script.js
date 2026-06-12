// ============================================================
//  TilZone SPA — script.js
//  Полная версия: Auth + Lessons + Profile + Leaderboard
// ============================================================

const API_BASE = "http://localhost:8000/v1";

// ── Глобальное состояние ─────────────────────────────────────
let currentUser      = JSON.parse(localStorage.getItem("tilzone_user"))        || null;
let accessToken      = localStorage.getItem("tilzone_access_token")            || null;
let refreshToken     = localStorage.getItem("tilzone_refresh_token")           || null;
let currentLang      = localStorage.getItem("tilzone_lang")                    || "ky";
let currentStudyLang = localStorage.getItem("tilzone_study_lang")              || "en";
let currentPage      = "home";
let pendingVerifyEmail = localStorage.getItem("tilzone_pending_verify_email")  || "";
let currentProfileTab   = "stats";
let currentRatingSubtab = "global";
let timerInterval    = null;

// Урок
let activeLessonId = null;
let lessonTasks    = [];
let taskIndex      = 0;
let taskAnswered   = false;

// AI-чат
const aiScenarios = [
  { id:1, name:"☕ Кафе",        dialog:[{role:"assistant",text:"Добрый день! Что желаете заказать?"}] },
  { id:2, name:"✈️ Аэропорт",   dialog:[{role:"assistant",text:"Ваш билет, пожалуйста."}] },
  { id:3, name:"🏫 Университет", dialog:[{role:"assistant",text:"Какой факультет вы выбрали?"}] },
  { id:4, name:"💼 Работа",      dialog:[{role:"assistant",text:"Расскажите о своём опыте работы."}] },
  { id:5, name:"🏨 Отель",       dialog:[{role:"assistant",text:"На сколько ночей вы хотите забронировать?"}] },
];
let currentScenario = aiScenarios[0];
let chatHistory     = [...currentScenario.dialog];

// Теория (мок)
const theoryCategories = [
  { slug:"tenses",   name:"Времена",  desc:"Все времена английского языка",
    content:"<h3>Present Simple</h3><p>I work, he works...</p><ul><li>I play / I don't play</li><li>I go to school every day.</li></ul>" },
  { slug:"verbs",    name:"Глаголы",  desc:"Правильные и неправильные глаголы",
    content:"<h3>Неправильные глаголы</h3><ul><li>go - went - gone</li><li>see - saw - seen</li><li>take - took - taken</li></ul>" },
  { slug:"articles", name:"Артикли",  desc:"A / An / The — употребление",
    content:"<p><b>a</b> — перед согласными: a cat<br><b>an</b> — перед гласными: an apple<br><b>the</b> — известный объект: the sun</p>" },
];

// ══════════════════════════════════════════════════════════════
//  API-КЛИЕНТ
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
    const message = errData?.detail?.error?.message || errData?.error?.message || errData?.detail || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, errData);
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
      if (data.refresh_token) { refreshToken = data.refresh_token; localStorage.setItem("tilzone_refresh_token", refreshToken); }
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
//  UI-УТИЛИТЫ
// ══════════════════════════════════════════════════════════════

function showToast(msg, type = "success") {
  document.getElementById("tilzone-toast")?.remove();
  const colors = { success:"bg-green-500", error:"bg-red-500", info:"bg-blue-500" };
  const el = document.createElement("div");
  el.id = "tilzone-toast";
  el.className = `fixed top-5 right-5 z-[200] text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${colors[type]||colors.success}`;
  el.innerText = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function setElText(id, val)      { const e = document.getElementById(id); if (e) e.innerText = String(val); }
function setElStyle(id, prop, v) { const e = document.getElementById(id); if (e) e.style[prop] = v; }

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
  if (field.nextElementSibling?.classList.contains("field-error")) field.nextElementSibling.remove();
  const p = document.createElement("p");
  p.className = "field-error text-xs text-red-500 mt-1";
  p.innerText = msg;
  field.insertAdjacentElement("afterend", p);
}

function clearFieldErrors(scope) {
  scope?.querySelectorAll(".field-error").forEach(e => e.remove());
  scope?.querySelectorAll(".border-red-400").forEach(e => e.classList.remove("border-red-400"));
}

function showAuthModal() { const m = document.getElementById("authModal"); m?.classList.remove("hidden"); m?.classList.add("flex"); }
function hideAuthModal() { const m = document.getElementById("authModal"); m?.classList.add("hidden");    m?.classList.remove("flex"); }

// ══════════════════════════════════════════════════════════════
//  ПЕРЕВОДЫ
// ══════════════════════════════════════════════════════════════

const i18n = {
  ky: { nav_home:"Башкы", nav_ai:"AI Сүйлөшүү", nav_theory:"Теория", nav_mvp:"MVP Режим", nav_profile:"Профиль",
        streak_label:"Катары менен күн", daily_label:"Күндүк тапшырмалар", xp_label:"Жалпы тажрыйба",
        level_label:"Денгээл", learning_path_title:"Окуу жолу", scores_title:"Сабактардын баасы",
        login_btn:"Кирүү", register_btn:"Катталуу", auth_title:"Улантуу үчүн аккаунт керек",
        logout:"Чыгуу", stats_tab:"Статистика", achievements_tab:"Жетишкендиктер",
        rating_tab:"Рейтинг", settings_tab:"Орнотуулар", days:"күн",
        ai_title:"AI Сүйлөшүү", scenarios:"Сценарийлер", history:"Диалог тарыхы",
        error_analysis:"Каталарды талдоо", theory_title:"Теория", mvp_title:"MVP Режим",
        mvp_desc:"Жөнөкөй окуу", loading:"Жүктөлүүдө...", global:"Глобалдык", friends:"Достор", pvp:"PvP" },
  ru: { nav_home:"Главная", nav_ai:"AI Собеседник", nav_theory:"Теория", nav_mvp:"MVP Режим", nav_profile:"Профиль",
        streak_label:"Дней подряд", daily_label:"Ежедневные задания", xp_label:"Всего XP",
        level_label:"Уровень", learning_path_title:"Путь обучения", scores_title:"Оценки уроков",
        login_btn:"Войти", register_btn:"Регистрация", auth_title:"Для продолжения войдите",
        logout:"Выйти", stats_tab:"Статистика", achievements_tab:"Достижения",
        rating_tab:"Рейтинг", settings_tab:"Настройки", days:"дн.",
        ai_title:"AI Собеседник", scenarios:"Сценарии", history:"История диалогов",
        error_analysis:"Анализ ошибок", theory_title:"Теория", mvp_title:"MVP Режим",
        mvp_desc:"Упрощённое обучение", loading:"Загрузка...", global:"Глобальный", friends:"Друзья", pvp:"PvP" },
  en: { nav_home:"Home", nav_ai:"AI Chat", nav_theory:"Theory", nav_mvp:"MVP Mode", nav_profile:"Profile",
        streak_label:"Day streak", daily_label:"Daily quests", xp_label:"Total XP",
        level_label:"Level", learning_path_title:"Learning path", scores_title:"Lesson scores",
        login_btn:"Login", register_btn:"Sign up", auth_title:"Please login to continue",
        logout:"Logout", stats_tab:"Statistics", achievements_tab:"Achievements",
        rating_tab:"Leaderboard", settings_tab:"Settings", days:"days",
        ai_title:"AI Companion", scenarios:"Scenarios", history:"History",
        error_analysis:"Error analysis", theory_title:"Theory", mvp_title:"MVP Mode",
        mvp_desc:"Simplified learning", loading:"Loading...", global:"Global", friends:"Friends", pvp:"PvP" },
};

function applyUILanguage(lang) {
  currentLang = lang;
  localStorage.setItem("tilzone_lang", lang);
  setElText("currentLangLabel", { ky:"Кыргызча", en:"English", ru:"Русский" }[lang] || lang);
  const t = i18n[lang] || i18n.ru;
  document.querySelectorAll("[data-i18n]").forEach(el => { const k=el.getAttribute("data-i18n"); if(t[k]) el.innerText=t[k]; });
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
//  СТРАНИЦА: LOGIN
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
    if (code === "email_not_verified" && loginVal.includes("@")) {
      pendingVerifyEmail = loginVal;
      localStorage.setItem("tilzone_pending_verify_email", pendingVerifyEmail);
      showToast("Сначала подтвердите email", "info");
      loadPage("verify");
      return;
    }
    showToast(err.message || "Ошибка входа", "error");
    setLoading("doLoginBtn", false, "Войти");
  }
}

// ══════════════════════════════════════════════════════════════
//  СТРАНИЦА: REGISTER
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
//  СТРАНИЦА: VERIFY
// ══════════════════════════════════════════════════════════════

function initVerifyPage() {
  const email = pendingVerifyEmail || currentUser?.email || "";
  if (!email) {
    showToast("Сначала зарегистрируйтесь, чтобы получить код", "error");
    loadPage("register");
    return;
  }

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
  setLoading("resendCodeBtn", true, "Отправить повторно");
  try {
    const data = await apiFetch("/auth/resend-verification", { method:"POST", json:{ email } });
    showToast(data.message || "Код отправлен");
    loadPage("verify");
  } catch(err) {
    showToast(err.message || "Не удалось отправить код", "error");
    setLoading("resendCodeBtn", false, "Отправить повторно");
  }
}

// ══════════════════════════════════════════════════════════════
//  FORGOT / RESET
// ══════════════════════════════════════════════════════════════

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
    if (!token) return showToast("Токен не найден. Перейдите по ссылке из письма.","error");
    setLoading("doResetBtn",true,"Сохранить пароль");
    try {
      await apiFetch("/auth/reset-password",{ method:"POST", json:{ token, new_password:newPass, password_confirmation:confirm } });
      showToast("Пароль изменён!"); loadPage("login");
    } catch(err) { showToast(err.message,"error"); setLoading("doResetBtn",false,"Сохранить пароль"); }
  });
}

// ══════════════════════════════════════════════════════════════
//  СТРАНИЦА: HOME
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
    container.innerHTML = `<p class="text-center text-gray-400 py-8">Не удалось загрузить уроки. Запущен ли сервер?</p>`;
  }
}

function renderLearningPath(lessons, container) {
  const statusCls = {
    completed: "bg-green-500 text-white ring-4 ring-green-200",
    available: "bg-orange-400 text-white cursor-pointer shadow-lg lesson-available",
    locked:    "bg-gray-200 text-gray-400 cursor-not-allowed",
  };
  let html = `<div class="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-6 min-w-max py-4">`;
  lessons.forEach((lesson, idx) => {
    const icon = lesson.status==="completed" ? "✓" : lesson.status==="locked" ? "🔒" : lesson.xp_reward;
    html += `
      <div class="flex flex-col items-center">
        <div class="w-20 h-20 rounded-full flex items-center justify-center font-bold text-xl shadow-md transition-all
                    ${statusCls[lesson.status]||statusCls.locked} learning-node"
             data-lesson-id="${lesson.id}" data-status="${lesson.status}">${icon}</div>
        <span class="text-xs font-medium mt-2 text-center max-w-[80px]">${lesson.title}</span>
        ${lesson.status==="completed" ? `<span class="text-[10px] text-green-600">${lesson.score} XP</span>` : ""}
      </div>`;
    if (idx < lessons.length-1)
      html += `<div class="learning-line ${lesson.status==="completed"?"completed":""}"></div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
  container.querySelectorAll(".learning-node").forEach(el => {
    el.addEventListener("click", () => {
      if (!currentUser) { showAuthModal(); return; }
      const s = el.dataset.status;
      if (s==="available" || s==="completed") { activeLessonId = parseInt(el.dataset.lessonId); loadPage("lesson"); }
      else showToast("🔒 Сначала пройдите предыдущий урок","error");
    });
  });
}

function renderScores(lessons, grid) {
  if (!grid) return;
  grid.innerHTML = lessons.map(l => `
    <div class="bg-white rounded-xl p-3 text-center shadow-sm score-card" title="${l.title}">
      <span class="text-[10px] text-gray-500 block truncate">${l.title}</span>
      <div class="text-lg font-bold ${l.score>0?"text-green-600":"text-gray-300"}">${l.score||0}</div>
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════
//  СТРАНИЦА: LESSON
// ══════════════════════════════════════════════════════════════

async function initLessonPage() {
  if (!currentUser)    { showAuthModal(); loadPage("home"); return; }
  if (!activeLessonId) { loadPage("home"); return; }
  document.getElementById("backToHomeBtn")?.addEventListener("click", () => loadPage("home"));
  try {
    const [lesson, tasks] = await Promise.all([
      apiFetch(`/lessons/${activeLessonId}`),
      apiFetch(`/lessons/${activeLessonId}/tasks`),
    ]);
    setElText("lessonTitle",    lesson.title);
    setElText("lessonLevel",    lesson.level);
    setElText("lessonXpReward", `+${lesson.xp_reward} XP`);
    lessonTasks = tasks;
    taskIndex   = 0;
    if (!tasks.length) {
      document.getElementById("taskCard").innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <i class="fas fa-box-open text-5xl mb-3"></i><p>Заданий пока нет</p>
        </div>`;
      document.getElementById("completeBtn")?.classList.remove("hidden");
      bindCompleteBtn(lesson.id);
      return;
    }
    renderTask(0);
  } catch(err) {
    showToast("Не удалось загрузить урок","error"); loadPage("home");
  }
}

function renderTask(index) {
  const task = lessonTasks[index];
  if (!task) return;
  taskAnswered = false;
  const total = lessonTasks.length;
  setElText("taskProgressLabel", `${index} / ${total}`);
  setElStyle("taskProgressBar","width", `${Math.round((index/total)*100)}%`);

  const prevBtn     = document.getElementById("prevTaskBtn");
  const nextBtn     = document.getElementById("nextTaskBtn");
  const completeBtn = document.getElementById("completeBtn");
  prevBtn?.classList.toggle("hidden", index === 0);
  nextBtn?.classList.add("hidden");
  completeBtn?.classList.add("hidden");

  // Сброс обработчика "Назад"
  const prevClone = prevBtn?.cloneNode(true);
  prevBtn?.replaceWith(prevClone);
  document.getElementById("prevTaskBtn")?.addEventListener("click", () => { if(taskIndex>0){ taskIndex--; renderTask(taskIndex); } });

  const card = document.getElementById("taskCard");
  if (!card) return;

  if (task.task_type === "translate" || task.task_type === "fill") {
    card.innerHTML = `
      <div>
        <p class="text-xs text-gray-400 uppercase mb-2">${task.task_type==="translate"?"Переведите":"Заполните пропуск"}</p>
        <p class="text-xl font-semibold mb-6">${task.prompt}</p>
        <input type="text" id="taskAnswer" placeholder="Ваш ответ..."
               class="w-full border-2 border-gray-200 rounded-xl p-3 text-lg focus:border-green-400 focus:outline-none transition">
      </div>
      <div class="flex justify-end mt-4">
        <button id="checkAnswerBtn" class="bg-green-500 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-green-600 transition">
          Проверить
        </button>
      </div>`;
    document.getElementById("taskAnswer")?.addEventListener("keydown", e => { if(e.key==="Enter") document.getElementById("checkAnswerBtn")?.click(); });
    document.getElementById("checkAnswerBtn")?.addEventListener("click", () => submitAnswer(task.id));

  } else if (task.task_type === "choice") {
    let options = [];
    try { options = JSON.parse(task.prompt); } catch { options = [task.prompt]; }
    const question = Array.isArray(options) ? options[0] : task.prompt;
    const choices  = Array.isArray(options) && options.length > 1 ? options.slice(1) : ["A","B","C","D"];
    card.innerHTML = `
      <div>
        <p class="text-xs text-gray-400 uppercase mb-2">Выберите правильный вариант</p>
        <p class="text-xl font-semibold mb-6">${question}</p>
        <div class="grid grid-cols-2 gap-3">
          ${choices.map(opt => `
            <button class="choice-btn border-2 border-gray-200 rounded-xl p-3 text-left hover:border-green-400 transition" data-value="${opt}">
              ${opt}
            </button>`).join("")}
        </div>
      </div>`;
    card.querySelectorAll(".choice-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (taskAnswered) return;
        card.querySelectorAll(".choice-btn").forEach(b => b.classList.remove("border-green-400","bg-green-50"));
        btn.classList.add("border-green-400","bg-green-50");
        submitAnswer(task.id, btn.dataset.value);
      });
    });

  } else {
    card.innerHTML = `
      <p class="text-xl font-semibold mb-6">${task.prompt}</p>
      <input type="text" id="taskAnswer" placeholder="Ваш ответ..." class="w-full border-2 border-gray-200 rounded-xl p-3">
      <button id="checkAnswerBtn" class="mt-4 bg-green-500 text-white px-6 py-2.5 rounded-xl">Проверить</button>`;
    document.getElementById("checkAnswerBtn")?.addEventListener("click", () => submitAnswer(task.id));
  }
}

async function submitAnswer(taskId, forcedAnswer) {
  if (taskAnswered) return;
  taskAnswered = true;
  const answer = forcedAnswer || document.getElementById("taskAnswer")?.value.trim();
  if (!answer) { taskAnswered = false; return showToast("Введите ответ","error"); }
  try {
    const result = await apiFetch(`/lessons/tasks/${taskId}/submit`,{ method:"POST", json:{ answer } });
    showAnswerFeedback(result);
    if (result.earned_xp && currentUser) {
      currentUser.xp    = (currentUser.xp||0) + result.earned_xp;
      currentUser.level = Math.floor(currentUser.xp/100)+1;
      localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
      updateUIForAuth();
      if (result.earned_xp > 0) showToast(`+${result.earned_xp} XP!`);
    }
    setTimeout(() => {
      const isLast = taskIndex >= lessonTasks.length - 1;
      if (isLast) {
        document.getElementById("completeBtn")?.classList.remove("hidden");
        bindCompleteBtn(activeLessonId);
      } else {
        const nextBtn = document.getElementById("nextTaskBtn");
        nextBtn?.classList.remove("hidden");
        const nextClone = nextBtn?.cloneNode(true);
        nextBtn?.replaceWith(nextClone);
        document.getElementById("nextTaskBtn")?.addEventListener("click", () => { taskIndex++; renderTask(taskIndex); });
      }
    }, 800);
  } catch(err) {
    taskAnswered = false; showToast(err.message||"Ошибка проверки","error");
  }
}

function showAnswerFeedback(result) {
  const card = document.getElementById("taskCard");
  if (!card) return;
  const fb = document.createElement("div");
  fb.className = `mt-4 p-4 rounded-xl text-sm font-medium ${result.correct
    ? "bg-green-50 text-green-700 border border-green-200"
    : "bg-red-50 text-red-700 border border-red-200"}`;
  fb.innerHTML = result.correct
    ? `✅ Правильно!${result.earned_xp>0?" +"+result.earned_xp+" XP":""}`
    : `❌ Неверно. Правильный ответ: <span class="font-bold">${result.expected}</span>`;
  card.appendChild(fb);
  const inp = card.querySelector("input"); if (inp) inp.disabled = true;
  const checkBtn = document.getElementById("checkAnswerBtn"); if (checkBtn) checkBtn.disabled = true;
}

function bindCompleteBtn(lessonId) {
  const btn = document.getElementById("completeBtn");
  if (!btn) return;
  const clone = btn.cloneNode(true);
  btn.replaceWith(clone);
  document.getElementById("completeBtn")?.addEventListener("click", async () => {
    try {
      const result = await apiFetch(`/lessons/${lessonId}/complete`,{ method:"POST" });
      if (result.earned_xp > 0) showToast(`🏁 Урок завершён! +${result.earned_xp} XP`);
      if (currentUser) {
        currentUser.xp = result.total_xp; currentUser.level = result.level; currentUser.streak = result.streak;
        localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
      }
      updateUIForAuth(); loadPage("home");
    } catch(err) { showToast(err.message,"error"); }
  });
}

// ══════════════════════════════════════════════════════════════
//  СТРАНИЦА: PROFILE
// ══════════════════════════════════════════════════════════════

function initProfilePage() {
  if (!currentUser) { showAuthModal(); loadPage("home"); return; }
  updateUIForAuth();
  renderAvatar();
  showProfileTab(currentProfileTab);
  document.querySelectorAll(".profile-tab").forEach(btn => {
    btn.addEventListener("click", () => showProfileTab(btn.dataset.tab));
  });
  document.getElementById("logoutBtn")?.addEventListener("click", () => { logout(); updateUIForAuth(); loadPage("home"); });
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
    showToast("Аватар обновлён!");
  } catch(err) { showToast(err.message||"Ошибка загрузки","error"); }
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
        <div class="bg-green-50  p-4 rounded-xl"><p class="text-xs text-gray-500">Всего XP</p>   <p class="text-2xl font-black text-green-700">${currentUser?.xp||0}</p></div>
        <div class="bg-orange-50 p-4 rounded-xl"><p class="text-xs text-gray-500">Стрик</p>     <p class="text-2xl font-black text-orange-600">${currentUser?.streak||0} дн.</p></div>
        <div class="bg-blue-50   p-4 rounded-xl"><p class="text-xs text-gray-500">PvP побед</p> <p class="text-2xl font-black text-blue-600">${currentUser?.pvp_wins||0}</p></div>
        <div class="bg-purple-50 p-4 rounded-xl"><p class="text-xs text-gray-500">ELO</p>       <p class="text-2xl font-black text-purple-600">${currentUser?.elo||1000}</p></div>
        <div class="bg-amber-50  p-4 rounded-xl"><p class="text-xs text-gray-500">Уровень</p>   <p class="text-2xl font-black text-amber-600">${currentUser?.level||1}</p></div>
        <div class="bg-gray-50   p-4 rounded-xl"><p class="text-xs text-gray-500">Лига</p>      <p class="text-2xl font-black">${currentUser?.league||"Bronze"}</p></div>
      </div>`;

  } else if (tab === "edit") {
    content.innerHTML = `
      <h3 class="text-xl font-bold mb-4">✏️ Редактировать профиль</h3>
      <div class="space-y-4 max-w-sm">
        <div><label class="text-sm font-medium text-gray-700 block mb-1">Имя</label>
          <input type="text" id="editName" value="${currentUser?.name||""}"
                 class="w-full border rounded-xl p-3 focus:border-green-400 focus:outline-none"></div>
        <div><label class="text-sm font-medium text-gray-700 block mb-1">Username</label>
          <input type="text" id="editUsername" value="${currentUser?.username||""}"
                 class="w-full border rounded-xl p-3 focus:border-green-400 focus:outline-none"></div>
        <div><label class="text-sm font-medium text-gray-700 block mb-1">Родной язык</label>
          <select id="editNativeLang" class="w-full border rounded-xl p-3 focus:border-green-400 focus:outline-none">
            <option value="ky" ${currentUser?.native_language==="ky"?"selected":""}>🇰🇬 Кыргызча</option>
            <option value="ru" ${currentUser?.native_language==="ru"?"selected":""}>🇷🇺 Русский</option>
            <option value="en" ${currentUser?.native_language==="en"?"selected":""}>🇬🇧 English</option>
          </select></div>
        <div><label class="text-sm font-medium text-gray-700 block mb-1">Изучаемый язык</label>
          <select id="editStudyLang" class="w-full border rounded-xl p-3 focus:border-green-400 focus:outline-none">
            <option value="ky" ${currentUser?.study_language==="ky"?"selected":""}>🇰🇬 Кыргызча</option>
            <option value="ru" ${currentUser?.study_language==="ru"?"selected":""}>🇷🇺 Русский</option>
            <option value="en" ${currentUser?.study_language==="en"?"selected":""}>🇬🇧 English</option>
          </select></div>
        <button id="saveProfileBtn" class="w-full bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600 transition">
          Сохранить изменения
        </button>
      </div>`;
    document.getElementById("saveProfileBtn")?.addEventListener("click", saveProfile);

  } else if (tab === "achievements") {
    const achv = [
      ["fas fa-medal text-amber-500",   "bg-amber-50",  "5-дневный стрик",   "+50 XP",  (currentUser?.streak||0)>=5],
      ["fas fa-chart-line text-blue-500","bg-blue-50",  "100 XP набрано",    "+20 XP",  (currentUser?.xp||0)>=100],
      ["fas fa-brain text-purple-500",  "bg-purple-50", "10 уроков подряд",  "+100 XP", false],
      ["fas fa-globe text-green-500",   "bg-green-50",  "Изучено 50 слов",   "+75 XP",  false],
      ["fas fa-fist-raised text-red-500","bg-red-50",   "Первая PvP победа", "+30 XP",  (currentUser?.pvp_wins||0)>=1],
      ["fas fa-fire text-orange-500",   "bg-orange-50", "Стрик 30 дней",     "+200 XP", (currentUser?.streak||0)>=30],
    ];
    content.innerHTML = `
      <h3 class="text-xl font-bold mb-4">🏅 Достижения</h3>
      <div class="grid grid-cols-2 gap-4">
        ${achv.map(([icon,bg,title,reward,unlocked]) => `
          <div class="${bg} p-4 rounded-xl text-center ${unlocked?"":"opacity-40 grayscale"}">
            <i class="${icon} text-3xl mb-2"></i>
            <p class="font-medium text-sm">${title}</p>
            <span class="text-xs text-gray-500">${reward}</span>
            ${unlocked ? '<p class="text-xs text-green-600 mt-1">✓ Получено</p>' : ""}
          </div>`).join("")}
      </div>`;

  } else if (tab === "rating") {
    content.innerHTML = `
      <div class="flex gap-3 mb-4 border-b pb-2">
        ${["global","pvp"].map(s => `
          <button data-rating-subtab="${s}" class="rating-subtab px-4 py-2 rounded-full text-sm font-medium transition
                  ${currentRatingSubtab===s?"bg-green-500 text-white":"bg-gray-100 hover:bg-gray-200"}">
            ${s==="global"?"🌍 По XP":"⚔️ По ELO"}
          </button>`).join("")}
      </div>
      <div id="ratingList"><div class="text-center py-6"><i class="fas fa-spinner fa-spin text-green-500 text-2xl"></i></div></div>`;
    document.querySelectorAll(".rating-subtab").forEach(btn => {
      btn.addEventListener("click", () => { currentRatingSubtab = btn.dataset.ratingSubtab; showProfileTab("rating"); });
    });
    loadLeaderboard(currentRatingSubtab);

  } else if (tab === "settings") {
    content.innerHTML = `
      <h3 class="text-xl font-bold mb-4">⚙️ Настройки</h3>
      <div class="space-y-5 max-w-sm">
        <div class="text-sm text-gray-500 space-y-1">
          <p>Email: <span class="font-medium text-gray-700">${currentUser?.email||""}</span></p>
          <p>Верифицирован: <span class="font-medium ${currentUser?.is_verified?"text-green-600":"text-red-500"}">${currentUser?.is_verified?"✓ Да":"✗ Нет"}</span></p>
        </div>
        <hr>
        <button id="deleteAvatarBtn" class="text-sm text-red-500 hover:underline flex items-center gap-1">
          <i class="fas fa-trash-alt"></i> Удалить аватар
        </button>
      </div>`;
    document.getElementById("deleteAvatarBtn")?.addEventListener("click", async () => {
      try {
        const data = await apiFetch("/user/avatar",{ method:"DELETE" });
        currentUser = data;
        localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
        renderAvatar(); updateUIForAuth();
        showToast("Аватар удалён");
      } catch(err) { showToast(err.message,"error"); }
    });
  }
}

async function saveProfile() {
  const name            = document.getElementById("editName")?.value.trim();
  const username        = document.getElementById("editUsername")?.value.trim();
  const native_language = document.getElementById("editNativeLang")?.value;
  const study_language  = document.getElementById("editStudyLang")?.value;
  if (!name)     return showFieldError("editName","Введите имя");
  if (!username) return showFieldError("editUsername","Введите username");
  setLoading("saveProfileBtn",true,"Сохранить изменения");
  try {
    const data = await apiFetch("/user/profile",{ method:"PATCH", json:{ name, username, native_language, study_language } });
    currentUser = data;
    localStorage.setItem("tilzone_user", JSON.stringify(currentUser));
    currentStudyLang = study_language;
    localStorage.setItem("tilzone_study_lang", currentStudyLang);
    updateUIForAuth();
    showToast("Профиль обновлён!");
  } catch(err) { showToast(err.message,"error"); }
  finally       { setLoading("saveProfileBtn",false,"Сохранить изменения"); }
}

// ══════════════════════════════════════════════════════════════
//  ЛИДЕРБОРД
// ══════════════════════════════════════════════════════════════

async function loadLeaderboard(subtab = "global") {
  const container = document.getElementById("ratingList");
  if (!container) return;
  container.innerHTML = `<div class="text-center py-6"><i class="fas fa-spinner fa-spin text-green-500 text-2xl"></i></div>`;
  try {
    const by   = subtab==="pvp" ? "pvp" : "xp";
    const data = await apiFetch(`/leaderboard?by=${by}&limit=20`);
    const { entries, my_rank } = data;
    if (!entries?.length) { container.innerHTML = `<p class="text-center text-gray-400 py-6">Пока никого нет</p>`; return; }
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
              <p class="font-medium text-sm truncate">${e.name}${e.is_me?" <span class='text-green-600 text-xs'>(вы)</span>":""}</p>
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
          Ваше место: <span class="font-bold text-green-600">#${my_rank}</span>
        </div>` : ""}
      </div>`;
  } catch { container.innerHTML = `<p class="text-center text-red-400 py-6">Ошибка загрузки рейтинга</p>`; }
}

// ══════════════════════════════════════════════════════════════
//  THEORY / MVP / AI
// ══════════════════════════════════════════════════════════════

function initTheoryPage() {
  const container = document.getElementById("theoryCategories");
  if (!container) return;
  container.innerHTML = theoryCategories.map(c => `
    <div class="bg-white rounded-2xl p-5 shadow-soft cursor-pointer theory-card hover:shadow-md transition" data-slug="${c.slug}">
      <h3 class="text-xl font-bold">${c.name}</h3>
      <p class="text-gray-500 mt-1 text-sm">${c.desc}</p>
    </div>`).join("");
  container.querySelectorAll(".theory-card").forEach(c => {
    c.addEventListener("click", () => {
      const cat = theoryCategories.find(t => t.slug===c.dataset.slug);
      if (!cat) return;
      document.getElementById("modalTitle").innerHTML  = cat.name;
      document.getElementById("modalContent").innerHTML = cat.content;
      const m = document.getElementById("theoryModal");
      m?.classList.remove("hidden"); m?.classList.add("flex");
    });
  });
  document.getElementById("closeModalBtn")?.addEventListener("click", () => {
    const m = document.getElementById("theoryModal");
    m?.classList.add("hidden"); m?.classList.remove("flex");
  });
}

function initMvpPage() {
  const mvpDiv = document.getElementById("mvpCard");
  if (!mvpDiv) return;
  mvpDiv.innerHTML = `
    <i class="fas fa-apple-alt text-6xl text-green-500 mb-4"></i>
    <h2 class="text-2xl font-bold">Урок: Еда</h2>
    <p class="my-4 text-lg">Переведите слово: <b>Apple</b></p>
    <div class="flex gap-3 justify-center flex-wrap">
      <button class="mvp-answer bg-green-50 px-6 py-3 rounded-xl hover:bg-green-100 border-2 border-transparent transition" data-correct="true">🍎 Яблоко</button>
      <button class="mvp-answer bg-gray-50  px-6 py-3 rounded-xl hover:bg-gray-100  border-2 border-transparent transition">🍐 Груша</button>
      <button class="mvp-answer bg-gray-50  px-6 py-3 rounded-xl hover:bg-gray-100  border-2 border-transparent transition">🍊 Апельсин</button>
    </div>
    <button id="mvpNext" class="mt-6 bg-green-500 text-white px-8 py-3 rounded-full hover:bg-green-600 hidden">Далее →</button>`;
  mvpDiv.querySelectorAll(".mvp-answer").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      mvpDiv.querySelectorAll(".mvp-answer").forEach(b => b.disabled = true);
      if (btn.dataset.correct) { btn.classList.add("bg-green-400","text-white","border-green-500"); showToast("+5 XP!"); }
      else                     { btn.classList.add("bg-red-100","border-red-400"); mvpDiv.querySelector("[data-correct]")?.classList.add("bg-green-300","border-green-500"); showToast("Неверно. Правильно: Яблоко","error"); }
      document.getElementById("mvpNext")?.classList.remove("hidden");
    });
  });
}

// Список ошибок за сессию
let sessionErrors = [];

function initAIPage() {
  sessionErrors = [];
  renderAIScenarios();
  renderHistoryPanel();

  // Заголовок сценария в шапке чата
  setElText("chatScenarioTitle", currentScenario.name);

  document.getElementById("sendChatBtn")?.addEventListener("click", sendAIMessage);
  document.getElementById("chatInput")?.addEventListener("keydown", e => { if (e.key === "Enter") sendAIMessage(); });
  document.getElementById("voiceBtn")?.addEventListener("click",    () => showToast("🎤 Голосовой ввод скоро появится", "info"));

  document.getElementById("clearChatBtn")?.addEventListener("click", () => {
    chatHistory   = [...currentScenario.dialog];
    sessionErrors = [];
    const bar = document.getElementById("errorAnalysisBar");
    if (bar) bar.classList.add("hidden");
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

  // Добавляем сообщение пользователя
  chatHistory.push({ role: "user", text });
  inp.value = "";

  // Typing-индикатор
  chatHistory.push({ role: "assistant", text: "...", typing: true });
  renderChat();

  // Строим историю для API (только реальные сообщения, без typing/correction)
  const historyForApi = chatHistory
    .filter(m => !m.typing && !m.correction && (m.role === "user" || m.role === "assistant"))
    .slice(-20)   // не более 20 сообщений
    .slice(0, -1)  // без последнего (текущего) — оно идёт в поле message
    .map(m => ({ role: m.role, content: m.text }));

  try {
    const data = await apiFetch("/ai/chat", {
      method: "POST",
      json: {
        message:  text,
        scenario: currentScenario.name,
        history:  historyForApi,
      },
    });

    chatHistory = chatHistory.filter(m => !m.typing);
    chatHistory.push({ role: "assistant", text: data.response });

    // Показываем исправление отдельным сообщением
    if (data.correction) {
      chatHistory.push({ role: "assistant", text: `✏️ ${data.correction}`, correction: true });
      sessionErrors.push({ original: text, corrected: data.correction });
      // Показываем панель анализа ошибок
      const bar = document.getElementById("errorAnalysisBar");
      const txt = document.getElementById("errorAnalysisText");
      if (bar && txt) { txt.innerText = data.correction; bar.classList.remove("hidden"); }
    }

    // Обновляем уровень-бейдж
    if (data.level_hint) {
      const badge = document.getElementById("aiLevelBadge");
      if (badge) { badge.innerText = data.level_hint; badge.classList.remove("hidden"); }
    }

    // XP
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
      ? "⚠️ AI не настроен. Добавьте ANTHROPIC_API_KEY в .env бэкенда."
      : "⚠️ Ошибка соединения с сервером.";
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
      renderAIScenarios();
      renderChat();
      renderErrorsPanel();
      renderHistoryPanel();
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

function renderErrorsPanel() {
  const el = document.getElementById("errorsList");
  if (!el) return;
  if (!sessionErrors.length) {
    el.innerHTML = `<p class="italic text-gray-400 text-xs">Ошибок не найдено — отлично!</p>`;
    return;
  }
  el.innerHTML = sessionErrors.map((e, i) => `
    <div class="bg-red-50 rounded-xl p-2 text-xs border border-red-100">
      <p class="text-red-400 line-through">${e.original}</p>
      <p class="text-green-700 font-medium mt-0.5">✓ ${e.corrected}</p>
    </div>`).join("");
}

function renderHistoryPanel() {
  const el = document.getElementById("historyList");
  if (!el) return;
  const userMessages = chatHistory.filter(m => m.role === "user" && !m.typing).slice(-6);
  if (!userMessages.length) { el.innerHTML = `<p class="text-gray-400 text-xs italic">Пока пусто</p>`; return; }
  el.innerHTML = userMessages.map(m => `
    <div class="truncate text-xs text-gray-500 py-0.5">— ${m.text}</div>`).join("");
}


async function loadAIHistory() {
  const el = document.getElementById("historyList");
  if (!el) return;
  if (!currentUser) { el.innerHTML = `<p class="text-xs text-gray-400 italic">Войдите, чтобы увидеть историю</p>`; return; }
  el.innerHTML = `<i class="fas fa-spinner fa-spin text-green-400"></i>`;
  try {
    const items = await apiFetch("/ai/history?limit=10");
    if (!items?.length) { el.innerHTML = `<p class="text-xs text-gray-400 italic">История пуста</p>`; return; }
    el.innerHTML = items.map(item => `
      <div class="text-xs border rounded-xl p-2 hover:bg-gray-50 cursor-pointer history-item" data-response="${encodeURIComponent(item.response)}">
        <p class="font-medium text-gray-600 truncate">${item.scenario}</p>
        <p class="text-gray-400 truncate mt-0.5">— ${item.message}</p>
      </div>`).join("");
    el.querySelectorAll(".history-item").forEach(item => {
      item.addEventListener("click", () => {
        const resp = decodeURIComponent(item.dataset.response);
        chatHistory.push({ role: "assistant", text: `📖 Из истории: ${resp}` });
        renderChat();
      });
    });
  } catch { el.innerHTML = `<p class="text-xs text-red-400">Ошибка загрузки</p>`; }
}

function renderLevelHints() {
  const el = document.getElementById("levelHints");
  if (!el) return;
  const xp    = currentUser?.xp || 0;
  const level = xp < 100 ? "A1" : xp < 300 ? "A2" : xp < 700 ? "B1" : xp < 1500 ? "B2" : "C1";
  const hints = {
    A1: ["Начните: Hello! / Good morning!", "Спросите: What is your name?", "Ответьте: My name is ..."],
    A2: ["Используйте: Can I have...?", "Спросите: How much does it cost?", "Опишите: I would like to..."],
    B1: ["Расскажите о себе подробнее", "Используйте прошедшее время", "Спросите мнение: What do you think?"],
    B2: ["Используйте идиомы", "Аргументируйте своё мнение", "Говорите развёрнутыми фразами"],
    C1: ["Обсудите абстрактные темы", "Используйте сослагательное наклонение", "Делайте комплексные высказывания"],
  };
  const list = hints[level] || hints.A1;
  el.innerHTML = `
    <p class="text-xs font-semibold text-green-600 mb-2">Уровень: ${level}</p>
    ${list.map(h => `<p class="text-xs text-gray-500">• ${h}</p>`).join("")}`;
}

// ══════════════════════════════════════════════════════════════
//  SPA-РОУТИНГ
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
  mvp:      initMvpPage,
};

async function loadPage(pageName) {
  const container = document.querySelector("#app-content .container-custom");
  if (!container) return;
  container.innerHTML = `<div class="text-center py-20"><i class="fas fa-spinner fa-spin text-5xl text-green-500 mb-4"></i><p data-i18n="loading">Загрузка...</p></div>`;
  try {
    const res = await fetch(`pages/${pageName}.html`);
    if (!res.ok) throw new Error();
    container.innerHTML = await res.text();
  } catch {
    container.innerHTML = `<div class="text-center py-20">
      <i class="fas fa-exclamation-triangle text-6xl text-red-400 mb-4"></i>
      <h1 class="text-2xl font-bold">Страница не найдена</h1>
      <a href="#" data-page="home" class="mt-4 inline-block bg-green-500 text-white px-6 py-2 rounded-xl">На главную</a>
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
      if (page==="profile" && !currentUser) { showAuthModal(); return; }
      loadPage(page);
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
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
