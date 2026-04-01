(() => {
  const state = { user: null, userLoaded: false, publicTracks: [], myTracks: [], avatarBust: 0 };

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v == null || v === false) continue;
      else node.setAttribute(k, String(v));
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function sameOriginPath(href) {
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return null;
      return url.pathname + url.search + url.hash;
    } catch {
      return null;
    }
  }

  function navigate(path, { replace = false } = {}) {
    if (replace) history.replaceState({}, "", path);
    else history.pushState({}, "", path);
    void renderRoute();
  }

  async function apiJson(url, opts = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail || data?.message || "Request failed";
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function apiForm(url, formData) {
    const res = await fetch(url, { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail || data?.message || "Request failed";
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function errorText(msg) {
    return el("p", { style: "margin-top:8px;color:#fca5a5;font-size:14px;" }, [msg]);
  }

  function infoText(msg) {
    return el("p", { style: "margin-top:8px;color:var(--muted);font-size:14px;" }, [msg]);
  }

  function validateEmail(email) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((email || "").trim().toLowerCase());
  }

  async function loadMe() {
    if (state.userLoaded) return state.user;
    try {
      state.user = await apiJson("/api/auth/me", { method: "GET" });
    } catch {
      state.user = null;
    } finally {
      state.userLoaded = true;
    }
    return state.user;
  }

  async function logout() {
    try {
      await apiJson("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {}
    state.user = null;
    state.userLoaded = true;
    navigate("/");
  }

  function header(subtitle, actions) {
    const brand = el("a", { class: "brand", href: "/", "data-link": "1" }, [
      el("div", { class: "logo" }, [el("img", { class: "logo-img", src: "/static/logo.svg", alt: "SpotX" })]),
      el("div", { class: "site-title" }, [el("h1", {}, ["SpotX"]), el("p", {}, [subtitle])]),
    ]);
    return el("header", { class: "header" }, [brand, el("div", { class: "header-actions" }, actions || [])]);
  }

  function avatarNode(user) {
    const name = user?.name || "Guest";
    const filename = user?.avatarFilename;
    if (filename) {
      const bust = state.avatarBust ? `?v=${state.avatarBust}` : "";
      return el("div", { class: "avatar" }, [
        el("img", { class: "avatar-image", src: `/media/${filename}${bust}`, alt: `Аватар ${name}` }),
      ]);
    }
    return el("div", { class: "avatar" }, [String(name).slice(0, 1).toUpperCase()]);
  }

  function avatarLinkNode(user) {
    if (user) return el("a", { class: "avatar-link", href: "/profile", "data-link": "1" }, [avatarNode(user)]);
    return avatarNode(user);
  }

  function field(labelText, inputNode, { help = null } = {}) {
    const id = inputNode.getAttribute("id");
    const label = el("label", { class: "field-label", for: id || "" }, [labelText]);
    const parts = [label, inputNode];
    if (help) parts.push(el("p", { class: "field-help" }, [help]));
    return el("div", { class: "field" }, parts);
  }

  function topNav(active) {
    const mk = (href, label, key) =>
      el(
        "a",
        { class: active === key ? "public-btn" : "small-btn", href, "data-link": "1" },
        [label]
      );
    return [mk("/", "Главная", "home"), mk("/tracks", "Треки", "tracks"), mk("/profile", "Профиль", "profile")];
  }

  function shell({ subtitle, actions, main, sidebar }) {
    const app = qs("#app");
    app.innerHTML = "";
    app.appendChild(
      el("div", { class: "container" }, [
        header(subtitle, actions),
        el("main", { class: "card" }, [main]),
        el("aside", { class: "sidebar" }, [sidebar || el("div")]),
      ])
    );

    // Notify auxiliary scripts (e.g. audio player) that SPA just re-rendered.
    try {
      window.dispatchEvent(new Event("spotx:render"));
    } catch {}
  }

  function trackItem(track, { own } = {}) {
    const buttons = [];
    buttons.push(el("button", { class: "play-btn", type: "button", "data-file": `/media/${track.filename}`, "data-title": track.title }, ["▶"]));
    buttons.push(el("a", { class: "download-btn", href: `/media/${track.filename}`, download: "1" }, ["⬇"]));
    if (own) {
      buttons.push(
        el(
          "button",
          {
            class: `privacy-btn ${track.is_public ? "privacy-public" : "privacy-private"}`,
            type: "button",
            "data-action": "toggle-privacy",
            "data-track-id": String(track.id),
          },
          [track.is_public ? "Сделать приватным" : "Сделать публичным"]
        )
      );
    }

    return el("div", { class: "track-item" }, [
      el("div", { class: "track-thumb" }, [String(track.title || "X").slice(0, 2).toUpperCase()]),
      el("div", { class: "track-details" }, [
        el("p", { class: "track-title" }, [track.title || "Без названия"]),
        el("p", { class: "track-meta" }, [
          own ? (track.is_public ? "Публичный" : "Приватный") : track.owner_name ? `by ${track.owner_name}` : "uploaded",
        ]),
        el("div", { class: "track-buttons" }, buttons),
      ]),
    ]);
  }

  function userSideCard() {
    return el("div", { class: "card profile-header" }, [
      avatarLinkNode(state.user),
      el("div", {}, [
        el("p", { class: "user-name" }, [state.user ? state.user.name : "Guest"]),
        el("div", { class: "user-actions" }, [
          state.user
            ? el("a", { class: "small-btn", href: "/profile/settings", "data-link": "1" }, ["Настройки"])
            : el("a", { class: "small-btn", href: "/auth/login", "data-link": "1" }, ["Вход"]),
          state.user
            ? el("button", { class: "logout-btn", type: "button", onclick: logout }, ["Выйти"])
            : el("a", { class: "small-btn", href: "/auth/register", "data-link": "1" }, ["Регистрация"]),
        ]),
      ]),
    ]);
  }

  async function viewHome() {
    document.title = "SpotX";

    const lead = el("div", {}, [
      el("h2", {}, ["SpotX"]),
      el("p", { style: "margin-top:6px;color:var(--muted);line-height:1.5;" }, [
        "Динамическое веб-приложение для публикации и прослушивания аудиотреков. ",
        "Регистрируйтесь, загружайте свои треки и управляйте их доступностью.",
      ]),
    ]);

    const features = el("div", { style: "margin-top:14px;" }, [
      el("h3", {}, ["Возможности"]),
      el("ul", { style: "margin-top:8px;color:var(--muted);line-height:1.6;padding-left:18px;" }, [
        el("li", {}, ["Прослушивание публичных треков"]),
        el("li", {}, ["Личный кабинет и управление приватностью"]),
        el("li", {}, ["Загрузка аудиофайлов"]),
        el("li", {}, ["Сессии и защита приватных разделов"]),
      ]),
    ]);

    const ctas = el("div", { style: "margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;" }, [
      el("a", { class: "public-btn", href: "/tracks", "data-link": "1" }, ["Перейти к трекам"]),
      state.user
        ? el("a", { class: "small-btn", href: "/profile", "data-link": "1" }, ["Открыть профиль"])
        : el("a", { class: "small-btn", href: "/auth/login", "data-link": "1" }, ["Войти"]),
    ]);

    shell({
      subtitle: "Главная",
      actions: topNav("home"),
      main: el("div", {}, [lead, features, ctas]),
      sidebar: userSideCard(),
    });
  }

  async function viewPublic() {
    document.title = "Треки - SpotX";
    const data = await apiJson("/api/tracks/public", { method: "GET" });
    state.publicTracks = Array.isArray(data.items) ? data.items : [];

    const list = el("div", { class: "tracks-list" }, state.publicTracks.map((t) => trackItem(t, { own: false })));

    const main = el("div", {}, [el("h2", {}, ["Треки"]), list]);
    shell({ subtitle: "Треки", actions: topNav("tracks"), main, sidebar: userSideCard() });
  }

  async function viewLogin() {
    document.title = "Вход - SpotX";
    const email = el("input", { class: "input", type: "email", placeholder: "Email", required: "1" });
    const password = el("input", { class: "input", type: "password", placeholder: "Пароль", required: "1" });
    const msg = el("div");

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if ((password.value || "").length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        try {
          state.user = await apiJson("/api/auth/login", { method: "POST", body: JSON.stringify({ email: email.value, password: password.value }) });
          state.userLoaded = true;
          navigate("/profile");
        } catch (err) {
          msg.appendChild(errorText(err.message || "Ошибка входа"));
        }
      },
    }, [email, password, el("button", { class: "upload-btn", type: "submit" }, ["Войти"]), msg]);

    shell({
      subtitle: "Вход",
      actions: [el("a", { class: "small-btn", href: "/auth/register", "data-link": "1" }, ["Регистрация"]), el("a", { class: "small-btn", href: "/auth/forgot-password", "data-link": "1" }, ["Забыли пароль?"])],
      main: el("div", {}, [el("h2", {}, ["Вход"]), form]),
      sidebar: el("div", { class: "card" }, [infoText("После успешного входа вы попадете в профиль.")]),
    });
  }

  async function viewRegister() {
    document.title = "Регистрация - SpotX";
    const email = el("input", { class: "input", type: "email", placeholder: "Email", required: "1" });
    const name = el("input", { class: "input", placeholder: "Имя", required: "1" });
    const password = el("input", { class: "input", type: "password", placeholder: "Пароль (мин. 6)", required: "1" });
    const msg = el("div");

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if ((name.value || "").trim().length < 2) return msg.appendChild(errorText("Имя должно содержать минимум 2 символа"));
        if ((password.value || "").length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        try {
          const data = await apiJson("/api/auth/register", { method: "POST", body: JSON.stringify({ email: email.value, name: name.value, password: password.value }) });
          state.user = { id: data.id, email: data.email, name: data.name, createdAt: data.createdAt, avatarFilename: data.avatarFilename || null };
          state.userLoaded = true;
          msg.appendChild(infoText("Успешно. Секретная фраза доступна в настройках профиля."));
          msg.appendChild(el("div", { style: "margin-top:10px;" }, [el("a", { class: "public-btn", href: "/profile", "data-link": "1" }, ["Перейти в профиль"])]));
        } catch (err) {
          msg.appendChild(errorText(err.message || "Ошибка регистрации"));
        }
      },
    }, [email, name, password, el("button", { class: "upload-btn", type: "submit" }, ["Зарегистрироваться"]), msg]);

    shell({
      subtitle: "Регистрация",
      actions: [el("a", { class: "small-btn", href: "/auth/login", "data-link": "1" }, ["Вход"]), el("a", { class: "small-btn", href: "/auth/forgot-password", "data-link": "1" }, ["Забыли пароль?"])],
      main: el("div", {}, [el("h2", {}, ["Регистрация"]), form]),
      sidebar: el("div", { class: "card" }, [infoText("После регистрации вы будете авторизованы.")]),
    });
  }

  async function viewForgot() {
    document.title = "Восстановление пароля - SpotX";
    const email = el("input", { class: "input", type: "email", placeholder: "Email", required: "1" });
    const phrase = el("input", { class: "input", placeholder: "Секретная фраза", required: "1" });
    const password = el("input", { class: "input", type: "password", placeholder: "Новый пароль (мин. 6)", required: "1" });
    const msg = el("div");

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if ((phrase.value || "").trim().length < 10) return msg.appendChild(errorText("Секретная фраза слишком короткая"));
        if ((password.value || "").length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        try {
          await apiJson("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email: email.value, recoveryPhrase: phrase.value, newPassword: password.value }) });
          msg.appendChild(infoText("Пароль изменен. Теперь войдите."));
          msg.appendChild(el("div", { style: "margin-top:10px;" }, [el("a", { class: "public-btn", href: "/auth/login", "data-link": "1" }, ["Вход"])]));
        } catch (err) {
          msg.appendChild(errorText(err.message || "Ошибка"));
        }
      },
    }, [email, phrase, password, el("button", { class: "upload-btn", type: "submit" }, ["Сменить пароль"]), msg]);

    shell({
      subtitle: "Восстановление пароля",
      actions: [el("a", { class: "small-btn", href: "/auth/login", "data-link": "1" }, ["Вход"]), el("a", { class: "small-btn", href: "/auth/register", "data-link": "1" }, ["Регистрация"])],
      main: el("div", {}, [el("h2", {}, ["Сброс пароля"]), form]),
      sidebar: el("div", { class: "card" }, [infoText("Введите email, секретную фразу и новый пароль.")]),
    });
  }

  async function viewProfile() {
    document.title = "Профиль - SpotX";
    if (!state.user) return navigate("/auth/login", { replace: true });
    const data = await apiJson("/api/tracks/mine", { method: "GET" });
    state.myTracks = Array.isArray(data.items) ? data.items : [];

    const list = el("div", { class: "tracks-list" }, state.myTracks.map((t) => trackItem(t, { own: true })));
    const main = el("div", {}, [el("h2", {}, ["Ваши треки"]), list]);

    const side = el("div", {}, [
      el("div", { class: "card profile-header" }, [
        avatarLinkNode(state.user),
        el("div", {}, [
          el("p", { class: "user-name" }, [state.user.name]),
          el("div", { class: "user-actions" }, [
            el("a", { class: "small-btn", href: "/profile/settings", "data-link": "1" }, ["Настройки"]),
            el("button", { class: "logout-btn", type: "button", onclick: logout }, ["Выйти"]),
          ]),
        ]),
      ]),
      el("div", { class: "card" }, [
        el("h3", { style: "margin-top:0;" }, ["Загрузка треков"]),
        infoText("Перейдите на страницу загрузки нового трека."),
        el("a", { class: "public-btn", href: "/tracks/upload", "data-link": "1" }, ["Перейти к загрузке"]),
      ]),
    ]);

    shell({ subtitle: "Профиль", actions: topNav("profile"), main, sidebar: side });
  }

  async function viewSettings() {
    document.title = "Настройки - SpotX";
    if (!state.user) return navigate("/auth/login", { replace: true });
    const data = await apiJson("/api/profile/settings", { method: "GET" });
    if (data?.avatarFilename !== undefined) state.user.avatarFilename = data.avatarFilename;

    const email = el("input", { id: "settings-email", class: "input", type: "email", placeholder: "name@example.com", value: data.email || "" });
    const name = el("input", { id: "settings-name", class: "input", placeholder: "Ваше имя", value: data.name || "" });
    const phrase = el("input", { id: "settings-phrase", class: "input", placeholder: "Например: atlas forest river ...", value: data.recoveryPhrase || "" });
    const pass = el("input", { id: "settings-pass", class: "input", type: "password", placeholder: "Оставьте пустым, если не меняете" });
    const avatar = el("input", { id: "settings-avatar", class: "file-input file-input-hidden", type: "file", accept: "image/*" });
    const msg = el("div");

    const avatarBox = avatarNode(state.user);
    avatarBox.classList.add("avatar-preview");
    const avatarHint = el("p", { class: "field-help" }, ["Нажмите на аватар в сайдбаре, чтобы перейти в профиль."]);

    const avatarFileLabel = el("div", { class: "avatar-file" }, ["Файл не выбран"]);
    const avatarPickBtn = el(
      "button",
      {
        class: "avatar-change-btn",
        type: "button",
        onclick: () => avatar.click(),
      },
      ["Сменить аватар"]
    );

    const avatarPreviewWrap = el("div", { class: "settings-avatar-row" }, [
      avatarBox,
      el("div", {}, [
        el("div", { style: "font-weight:700;margin-bottom:4px;" }, ["Аватар"]),
        el("div", { style: "color:var(--muted);font-size:12px;line-height:1.5;" }, ["jpg/png/webp/gif до 1 файла."]),
        el("div", { style: "margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;" }, [
          avatarPickBtn,
          avatarFileLabel,
        ]),
      ]),
    ]);

    avatar.addEventListener("change", () => {
      const f = avatar.files && avatar.files[0];
      avatarFileLabel.textContent = f ? f.name : "Файл не выбран";
      if (!f) return;
      const img = avatarBox.querySelector("img");
      const url = URL.createObjectURL(f);
      if (img) img.src = url;
      else {
        avatarBox.innerHTML = "";
        avatarBox.appendChild(el("img", { class: "avatar-image", src: url, alt: `Аватар ${state.user?.name || ""}` }));
      }
    });

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if ((name.value || "").trim().length < 2) return msg.appendChild(errorText("Имя должно содержать минимум 2 символа"));
        if ((phrase.value || "").trim().length < 10) return msg.appendChild(errorText("Секретная фраза слишком короткая"));
        if (pass.value && pass.value.length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));

        const fd = new FormData();
        fd.set("email", email.value);
        fd.set("name", name.value);
        fd.set("recovery_phrase", phrase.value);
        if (pass.value) fd.set("password", pass.value);
        if (avatar.files && avatar.files[0]) fd.set("avatar", avatar.files[0]);

        try {
          const res = await apiForm("/api/profile/settings", fd);
          if (res?.user?.name) state.user.name = res.user.name;
          if (res?.user?.avatarFilename !== undefined) state.user.avatarFilename = res.user.avatarFilename;
          if (avatar.files && avatar.files[0]) state.avatarBust = Date.now();
          msg.appendChild(infoText("Сохранено"));
        } catch (err) {
          msg.appendChild(errorText(err.message || "Ошибка"));
        }
      },
    }, [
      avatarPreviewWrap,
      avatar,
      avatarHint,
      field("Email", email),
      field("Имя", name),
      field("Секретная фраза", phrase, { help: "Нужна для восстановления пароля. Храните в надежном месте." }),
      field("Новый пароль", pass, { help: "Минимум 6 символов. Оставьте пустым, если не меняете." }),
      el("button", { class: "upload-btn", type: "submit" }, ["Сохранить изменения"]),
      msg,
    ]);

    shell({
      subtitle: "Настройки профиля",
      actions: [el("a", { class: "small-btn", href: "/profile", "data-link": "1" }, ["Назад в профиль"])],
      main: el("div", {}, [el("h2", {}, ["Настройки профиля"]), form]),
      sidebar: el("div"),
    });
  }

  async function viewUpload() {
    document.title = "Загрузка трека - SpotX";
    if (!state.user) return navigate("/auth/login", { replace: true });
    const title = el("input", { class: "input", placeholder: "Название трека", required: "1" });
    // Custom file picker UI (native input hidden).
    const file = el("input", { class: "file-input file-input-hidden", type: "file", accept: "audio/*" });
    const msg = el("div");

    const fileName = el("div", { class: "avatar-file" }, ["Файл не выбран"]);
    const pick = el("button", { class: "avatar-change-btn", type: "button", onclick: () => file.click() }, ["Выбрать аудио"]);
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      fileName.textContent = f ? f.name : "Файл не выбран";
    });

    const filePicker = el("div", { class: "field" }, [
      el("div", { class: "field-label" }, ["Аудиофайл"]),
      el("div", { class: "card", style: "padding:12px;display:flex;gap:10px;align-items:center;width:100%;" }, [
        pick,
        fileName,
      ]),
      el("p", { class: "field-help" }, ["Поддерживаются любые аудиофайлы, которые воспроизводит браузер (mp3/ogg/wav и т.д.)."]),
    ]);

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.innerHTML = "";
        if (!title.value.trim()) return msg.appendChild(errorText("Название трека обязательно"));
        if (!file.files || !file.files[0]) return msg.appendChild(errorText("Выберите файл"));

        const fd = new FormData();
        fd.set("title", title.value.trim());
        fd.set("file", file.files[0]);

        try {
          await apiForm("/api/tracks/upload", fd);
          msg.appendChild(infoText("Трек загружен"));
          msg.appendChild(el("div", { style: "margin-top:10px;" }, [el("a", { class: "public-btn", href: "/profile", "data-link": "1" }, ["В профиль"])]));
        } catch (err) {
          msg.appendChild(errorText(err.message || "Ошибка загрузки"));
        }
      },
    }, [
      field("Название трека", title),
      filePicker,
      file,
      el("button", { class: "upload-btn", type: "submit" }, ["Загрузить"]),
      msg,
    ]);

    shell({
      subtitle: "Загрузка трека",
      actions: topNav("profile"),
      main: el("div", {}, [el("h2", {}, ["Добавить новый трек"]), form]),
      sidebar: el("div"),
    });
  }

  async function renderRoute() {
    await loadMe();
    const path = window.location.pathname;
    if (path === "/") return viewHome();
    if (path === "/tracks") return viewPublic();
    if (path === "/auth/login") return viewLogin();
    if (path === "/auth/register") return viewRegister();
    if (path === "/auth/forgot-password") return viewForgot();
    if (path === "/profile") return viewProfile();
    if (path === "/profile/settings") return viewSettings();
    if (path === "/tracks/upload") return viewUpload();
    return viewHome();
  }

  document.addEventListener("click", async (e) => {
    const a = e.target.closest("a[data-link]");
    if (a) {
      const path = sameOriginPath(a.getAttribute("href") || "");
      if (path) {
        e.preventDefault();
        navigate(path);
        return;
      }
    }

    const btn = e.target.closest("button[data-action='toggle-privacy']");
    if (btn) {
      const id = btn.getAttribute("data-track-id");
      if (!id) return;
      try {
        await apiJson(`/toggle_privacy/${id}`, { method: "POST", body: "{}" });
        await viewProfile();
      } catch (err) {
        alert(err.message || "Ошибка");
      }
    }
  });

  window.addEventListener("popstate", () => void renderRoute());
  void renderRoute();
})();
