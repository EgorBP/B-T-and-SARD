(() => {
  const state = {
    user: null,
    userLoaded: false,
    publicTracks: [],
    myTracks: [],
    favoriteTracks: [],
    uploadSessionTracks: [],
    uploadDraft: null,
    avatarBust: 0,
    topTracks: [],
    search: { q: "", scope: "public", by: "title", items: [], didSearch: false },
    scrollPosition: 0,
  };
  let cleanupPageBindings = null;

  function setPageCleanup(cleanupFn) {
    if (typeof cleanupPageBindings === "function") {
      try {
        cleanupPageBindings();
      } catch {}
    }
    cleanupPageBindings = typeof cleanupFn === "function" ? cleanupFn : null;
  }

  function saveScrollPosition() {
    const tracksList = qs(".tracks-list");
    if (tracksList) {
      state.scrollPosition = tracksList.scrollTop;
    }
  }

  function restoreScrollPosition() {
    const tracksList = qs(".tracks-list");
    if (tracksList && state.scrollPosition > 0) {
      requestAnimationFrame(() => {
        tracksList.scrollTop = state.scrollPosition;
      });
    }
  }

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

  const PAGE_STYLES = {
    "/tracks/upload": ["/static/pages-css/upload.css"],
    "/profile": ["/static/pages-css/profile.css"],
    "/profile/settings": ["/static/pages-css/profile.css"],
    "/search": ["/static/pages-css/search.css"],
    "/auth/login": ["/static/pages-css/auth.css"],
    "/auth/register": ["/static/pages-css/auth.css"],
    "/auth/forgot-password": ["/static/pages-css/auth.css"],
    "/tracks": ["/static/pages-css/public.css"],
  };

  function syncPageStyles() {
    const head = document.head;
    head.querySelectorAll("link[data-spotx-page-style]").forEach((node) => node.remove());
    const path = window.location.pathname;
    const files = PAGE_STYLES[path] || [];
    for (const href of files) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-spotx-page-style", "1");
      head.appendChild(link);
    }
  }

  const PAGE_JS = {
    "/": ["/static/pages-js/viewHome.js"],
    "/tracks": ["/static/pages-js/viewPublic.js"],
    "/favorites": ["/static/pages-js/viewFavorites.js"],
    "/search": ["/static/pages-js/viewSearch.js"],
    "/auth/login": ["/static/pages-js/viewLogin.js"],
    "/auth/register": ["/static/pages-js/viewRegister.js"],
    "/auth/forgot-password": ["/static/pages-js/viewForgot.js"],
    "/profile": ["/static/pages-js/viewProfile.js"],
    "/profile/settings": ["/static/pages-js/viewSettings.js"],
    "/tracks/upload": ["/static/pages-js/viewUpload.js"],
  };
  const pageJsCache = new Map();

  function pageJsForPath(path) {
    const match = path.match(/^\/tracks\/\d+\/edit$/);
    if (match) return ["/static/pages-js/viewTrackEdit.js"];
    if (PAGE_JS[path]) return PAGE_JS[path];
    return [];
  }

  async function loadPageJs(path) {
    const files = pageJsForPath(path);
    await Promise.all(files.map((src) => {
      if (!pageJsCache.has(src)) {
        const promise = fetch(src)
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to load ${src}`);
            return res.text();
          })
          .then((code) => {
            eval(code);
          })
          .catch((e) => {
            // Remove from cache so a retry can succeed
            pageJsCache.delete(src);
            throw new Error(networkError(e));
          });
        pageJsCache.set(src, promise);
      }
      return pageJsCache.get(src);
    }));
  }

  function navigate(path, { replace = false } = {}) {
    if (replace) history.replaceState({}, "", path);
    else history.pushState({}, "", path);
    void renderRoute();
  }

  const HTTP_STATUS_MESSAGES = {
    400: "Некорректный запрос",
    401: "Требуется авторизация",
    403: "Доступ запрещён",
    404: "Не найдено",
    422: "Ошибка валидации",
    429: "Слишком много запросов, попробуйте позже",
    500: "Ошибка сервера, попробуйте позже",
    502: "Сервер временно недоступен",
    503: "Сервис недоступен, попробуйте позже",
    504: "Сервер не ответил вовремя",
  };

  function friendlyError(status, serverMsg) {
    if (serverMsg) return serverMsg;
    return HTTP_STATUS_MESSAGES[status] || `Ошибка запроса (код ${status})`;
  }

  const NETWORK_ERROR_MARKERS = ["failed to fetch", "networkerror", "network", "нет соединения", "не удалось выполнить", "сервер не отвечает", "timeout", "aborted"];

  function isNetworkOrServerError(err) {
    if (err instanceof TypeError) return true;
    const status = err?.status;
    if (status && status >= 500) return true;
    const msg = (err?.message || "").toLowerCase();
    return NETWORK_ERROR_MARKERS.some((m) => msg.includes(m));
  }

  function networkError(cause) {
    const msg = (cause?.message || "").toLowerCase();
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network"))
      return "Нет соединения с сервером. Проверьте подключение к сети";
    if (msg.includes("timeout") || msg.includes("aborted"))
      return "Сервер не отвечает. Попробуйте позже";
    return "Не удалось выполнить запрос. Попробуйте позже";
  }

  async function handleResponse(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const serverMsg = data?.detail || data?.message || "";
      const msg = friendlyError(res.status, serverMsg);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function apiJson(url, opts = {}) {
    let res;
    try {
      res = await fetch(url, {
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        ...opts,
      });
    } catch (e) {
      throw new Error(networkError(e));
    }
    return handleResponse(res);
  }

  async function apiForm(url, formData) {
    let res;
    try {
      res = await fetch(url, { method: "POST", body: formData });
    } catch (e) {
      throw new Error(networkError(e));
    }
    return handleResponse(res);
  }

  async function apiFormAny(url, method, formData) {
    let res;
    try {
      res = await fetch(url, { method, body: formData });
    } catch (e) {
      throw new Error(networkError(e));
    }
    return handleResponse(res);
  }

  function errorText(msg) {
    return el("p", { style: "margin-top:8px;color:#fca5a5;font-size:14px;" }, [msg]);
  }

  function infoText(msg) {
    return el("p", { style: "margin-top:8px;color:var(--muted);font-size:14px;" }, [msg]);
  }

  function emptyStateCard({ title, text, actionHref, actionLabel }) {
    const children = [
      el("div", { class: "empty-state-icon", "aria-hidden": "true" }, ["404"]),
      el("div", { class: "empty-state-body" }, [
        el("h2", { class: "empty-state-title" }, [title]),
        el("p", { class: "empty-state-text" }, [text]),
      ]),
    ];
    if (actionHref && actionLabel) {
      children.push(
        el("div", { class: "empty-state-actions" }, [
          el("a", { class: "public-btn", href: actionHref, "data-link": "1" }, [actionLabel]),
        ])
      );
    }
    return el("div", { class: "empty-state" }, children);
  }

  function loadingRow(label = "Загрузка...") {
    return el("div", { class: "loading-row" }, [
      el("div", { class: "spinner", "aria-hidden": "true" }, []),
      el("div", {}, [label]),
    ]);
  }

  function validateEmail(email) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((email || "").trim().toLowerCase());
  }

  const RECOVERY_QUESTIONS = [
    "Как звали вашего первого питомца?",
    "Как называлась улица, где вы выросли?",
    "Какое имя было у вашего любимого учителя?",
    "Как назывался ваш первый фильм/книга, который вам запомнился?",
    "Какой был ваш любимый город в детстве?",
  ];

  function recoveryQuestionSelect(id, value) {
    const select = el("select", { id, class: "input", required: "1" });
    for (const question of RECOVERY_QUESTIONS) {
      select.appendChild(el("option", { value: question }, [question]));
    }
    select.value = value || RECOVERY_QUESTIONS[0];
    return select;
  }

  const ICON = {
    play:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 17v-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 8h.01" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="1.4" opacity="0.9"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v10M7 8l5 5 5-5M5 21h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    heart:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-7.25-4.5-9.5-8.7C.65 8.5 2.3 5.5 5.6 4.7c2.1-.5 4.2.3 5.4 1.9 1.2-1.6 3.3-2.4 5.4-1.9 3.3.8 4.95 3.8 3.1 7.6C19.25 16.5 12 21 12 21z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    heartFill:
      '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-7.25-4.5-9.5-8.7C.65 8.5 2.3 5.5 5.6 4.7c2.1-.5 4.2.3 5.4 1.9 1.2-1.6 3.3-2.4 5.4-1.9 3.3.8 4.95 3.8 3.1 7.6C19.25 16.5 12 21 12 21z"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6m-8 4h10m-9 0l1 14h6l1-14M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 11V8a5 5 0 0110 0v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7 11h10v10H7V11z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    unlock:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 11V8a5 5 0 00-9.6-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7 11h10v10H7V11z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    github:
      '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.25c-5.38 0-9.75 4.37-9.75 9.75 0 4.3 2.79 7.95 6.66 9.24.49.09.67-.21.67-.48 0-.24-.01-.87-.01-1.71-2.71.59-3.28-1.31-3.28-1.31-.44-1.12-1.08-1.42-1.08-1.42-.88-.6.07-.59.07-.59.97.07 1.48 1 1.48 1 .86 1.48 2.26 1.05 2.81.8.09-.63.34-1.05.62-1.29-2.16-.25-4.43-1.08-4.43-4.8 0-1.06.38-1.93 1-2.61-.1-.25-.43-1.26.1-2.62 0 0 .82-.26 2.7 1a9.4 9.4 0 012.46-.33c.84 0 1.68.11 2.46.33 1.88-1.26 2.7-1 2.7-1 .53 1.36.2 2.37.1 2.62.62.68 1 1.55 1 2.61 0 3.73-2.27 4.55-4.44 4.8.35.3.66.88.66 1.78 0 1.29-.01 2.33-.01 2.65 0 .27.18.58.68.48A9.76 9.76 0 0021.75 12c0-5.38-4.37-9.75-9.75-9.75z"/></svg>',
  };

  function fmtDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function trackThumbNode(track) {
    if (track?.coverFilename) {
      return el("img", { class: "track-cover", src: `/media/${track.coverFilename}`, alt: `Обложка ${track.title || ""}` });
    }
    return el("div", { class: "track-thumb-text" }, [String(track?.title || "X").slice(0, 2).toUpperCase()]);
  }

  let modal = null;
  function ensureModal() {
    if (modal) return modal;
    const overlay = el("div", { class: "modal-overlay", "aria-hidden": "true" });
    const dialog = el("div", { class: "modal", role: "dialog", "aria-modal": "true" });
    const close = el("button", { class: "modal-close", type: "button", "aria-label": "Закрыть", html: "✕" });
    const body = el("div", { class: "modal-body" });

    close.addEventListener("click", () => hideModal());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hideModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideModal();
    });

    dialog.appendChild(close);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    modal = { overlay, body };
    return modal;
  }

  function showModal(node) {
    const m = ensureModal();
    m.body.innerHTML = "";
    m.body.appendChild(node);
    m.overlay.classList.add("active");
    m.overlay.setAttribute("aria-hidden", "false");
  }

  function hideModal() {
    if (!modal) return;
    modal.overlay.classList.remove("active");
    modal.overlay.setAttribute("aria-hidden", "true");
    modal.body.innerHTML = "";
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
    return [
      mk("/profile", "Профиль", "profile"),
      mk("/search", "Поиск", "search"),
      mk("/favorites", "Избранное", "favorites"),
      mk("/tracks", "Треки", "tracks"),
      mk("/", "Главная", "home"),
    ];
  }

  function footer() {
    return el("footer", { class: "footer" }, [
      el("a", {
        class: "footer-link",
        href: "https://github.com/EgorBP",
        target: "_blank",
        rel: "noreferrer",
        "aria-label": "GitHub EgorBP",
        title: "GitHub EgorBP",
        html: ICON.github,
      }, []),
    ]);
  }

  function loadMoreItem(onClick, loading) {
    const btn = el("button", { class: "public-btn load-more-btn", type: "button", disabled: loading ? "1" : null }, [
      loading ? "Загружаем..." : "Загрузить ещё",
    ]);
    btn.addEventListener("click", () => {
      if (!loading) onClick();
    });

    return btn;
  }

  function restoreFileInput(input, file) {
    if (!input || !file) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    } catch {}
  }

  function forEachTrackList(cb) {
    const lists = [
      state.myTracks,
      state.publicTracks,
      state.favoriteTracks,
      state.uploadSessionTracks,
      state.topTracks,
      state.search?.items,
    ];
    for (const list of lists) cb(list);
  }

  function updateTrackInState(trackId, updater) {
    forEachTrackList((list) => {
      if (!Array.isArray(list)) return;
      const item = list.find((x) => Number(x.id) === Number(trackId));
      if (item) updater(item);
    });
  }

  function updateTrackPrivacyInState(trackId, isPublic) {
    updateTrackInState(trackId, (item) => {
      item.is_public = !!isPublic;
    });
  }

  function updateTrackFavoriteInState(trackId, isFavorite) {
    updateTrackInState(trackId, (item) => {
      item.is_favorite = !!isFavorite;
    });
  }

  function removeTrackFromState(trackId) {
    const remove = (list) => {
      if (!Array.isArray(list)) return list;
      return list.filter((x) => Number(x.id) !== Number(trackId));
    };
    state.myTracks = remove(state.myTracks) || [];
    state.publicTracks = remove(state.publicTracks) || [];
    state.favoriteTracks = remove(state.favoriteTracks) || [];
    state.uploadSessionTracks = remove(state.uploadSessionTracks) || [];
    state.topTracks = remove(state.topTracks) || [];
    if (state.search && Array.isArray(state.search.items)) {
      state.search.items = remove(state.search.items) || [];
    }
  }

  function tracksForScope(scope) {
    if (scope === "mine") {
      if (window.location.pathname === "/tracks/upload") return state.uploadSessionTracks;
      return state.myTracks;
    }
    if (scope === "favorites") return state.favoriteTracks;
    if (scope === "top") return state.topTracks;
    return state.publicTracks;
  }

  function shell({ subtitle, actions, main, sidebar }) {
    syncPageStyles();
    const app = qs("#app");
    app.innerHTML = "";
    const path = window.location.pathname;
    const classes = ["container"];
    if (path === "/tracks") classes.push("page-tracks");
    if (path === "/profile") classes.push("page-profile");
    if (path === "/search") classes.push("page-search");
    if (path === "/favorites") classes.push("page-favorites");
    if (path === "/tracks/upload") classes.push("page-upload");
    const containerClass = classes.join(" ");
    app.appendChild(
      el("div", { class: containerClass }, [
        header(subtitle, actions),
        el("main", { class: "card" }, [main]),
        el("aside", { class: "sidebar" }, [sidebar || el("div")]),
        path === "/tracks/upload" ? null : footer(),
      ])
    );

    // Notify auxiliary scripts (e.g. audio player) that SPA just re-rendered.
    try {
      window.dispatchEvent(new Event("spotx:render"));
    } catch {}
  }

  function trackItem(track, { own, scope } = {}) {
    const ownedByUser = !!state.user && Number(track.owner_id) === Number(state.user.id);
    const isOwnTrack = !!own || ownedByUser;
    const buttons = [];
    buttons.push(
      el("button", { class: "icon-btn play-btn", type: "button", "data-file": `/media/${track.filename}`, "data-title": track.title, "data-track-id": String(track.id), "data-cover": track.coverFilename ? `/media/${track.coverFilename}` : "", "aria-label": "Воспроизвести", html: ICON.play }, [])
    );
    if (own) {
      // Order requested: play, privacy, info.
      buttons.push(
        el(
          "button",
          {
            class: `privacy-btn ${track.is_public ? "privacy-public" : "privacy-private"}`,
            type: "button",
            "data-action": "toggle-privacy",
            "data-track-id": String(track.id),
          },
          [
            el("span", { class: "pill-icon", html: track.is_public ? ICON.unlock : ICON.lock }, []),
            el("span", { class: "pill-text" }, [track.is_public ? "Публичный" : "Приватный"]),
          ]
        )
      );
    }

    if (state.user) {
      buttons.push(
        el(
          "button",
          {
            class: `icon-btn favorite-btn ${track.is_favorite ? "favorite-on" : "favorite-off"}`,
            type: "button",
            "data-action": "toggle-favorite",
            "data-track-id": String(track.id),
            "data-favorite": track.is_favorite ? "1" : "0",
            "aria-label": track.is_favorite ? "Убрать из избранного" : "Добавить в избранное",
            title: track.is_favorite ? "Убрать из избранного" : "Добавить в избранное",
            html: track.is_favorite ? ICON.heartFill : ICON.heart,
          },
          []
        )
      );
    }

    if (!own && (track.is_public || ownedByUser || scope === "favorites")) {
      buttons.push(
        el("a", { class: "icon-btn download-btn", href: `/media/${track.filename}`, download: "1", "data-track-id": String(track.id), "aria-label": "Скачать", html: ICON.download }, [])
      );
    }

    buttons.push(
      el(
        "button",
        {
          class: "icon-btn info-btn",
          type: "button",
          "data-action": "track-info",
          "data-track-id": String(track.id),
          "data-scope": scope || (own ? "mine" : "public"),
          "aria-label": "Информация",
          html: ICON.info,
        },
        []
      )
    );

    return el("div", { class: "track-item", "data-track-id": String(track.id) }, [
      el("div", { class: "track-thumb" }, [trackThumbNode(track)]),
      el("div", { class: "track-details" }, [
        el("div", { class: "track-top" }, [
          el("p", { class: "track-title" }, [track.title || "Без названия"]),
          el("div", { class: "track-actions" }, buttons),
        ]),
        el("p", { class: "track-meta" }, [
          isOwnTrack ? "Ваш трек" : track.owner_name ? `by ${track.owner_name}` : "uploaded",
          track.createdAt ? ` • ${fmtDate(track.createdAt)}` : "",
          ` • ⬇ ${Number(track.downloadsCount ?? track.downloads ?? 0)}`,
          ` • ♥ ${Number(track.favoritesCount ?? track.favorites ?? 0)}`,
        ]),
      ]),
    ]);
  }

  function refreshTrackItems(trackId) {
    const items = document.querySelectorAll(`.track-item[data-track-id="${trackId}"]`);
    for (const oldEl of items) {
      const scope = oldEl.querySelector("[data-scope]")?.getAttribute("data-scope")
        || (oldEl.querySelector(".privacy-btn") ? "mine" : "public");
      const own = scope === "mine";
      const list = tracksForScope(scope);
      const track = list.find((x) => Number(x.id) === Number(trackId));
      if (!track) continue;
      const newEl = trackItem(track, { own, scope });
      oldEl.replaceWith(newEl);
    }
    try { window.dispatchEvent(new Event("spotx:render")); } catch {}
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

    const head = el("div", { class: "section-head" }, [
      el("h2", { class: "section-title" }, ["Топ-10 по скачиваниям"]),
    ]);
    const list = el("div", { class: "tracks-list" }, []);
    const listStatus = el("div");
    const main = el("div", {}, [head, list, listStatus]);

    const aboutCard = el("div", { class: "card", style: "margin-top:12px;padding:14px;" }, [
      el("h3", { style: "margin-bottom:6px;" }, ["SpotX"]),
      el("p", { style: "color:var(--muted);line-height:1.5;font-size:.92em;" }, [
        "Публикуйте, слушайте и скачивайте аудиотреки. ",
        "Управляйте приватностью, добавляйте в избранное.",
      ]),
      el("div", { style: "margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;" }, [
        el("a", { class: "public-btn", href: "/tracks", "data-link": "1" }, ["Все треки"]),
        state.user
          ? el("a", { class: "small-btn", href: "/profile", "data-link": "1" }, ["Профиль"])
          : el("a", { class: "small-btn", href: "/auth/login", "data-link": "1" }, ["Войти"]),
      ]),
    ]);

    const sidebar = el("div", {}, [userSideCard(), aboutCard]);

    shell({
      subtitle: "Главная",
      actions: topNav("home"),
      main,
      sidebar,
    });

    // Load top tracks
    listStatus.textContent = "Загрузка...";
    try {
      const data = await apiJson("/api/tracks/top");
      const tracks = data.items || [];
      state.topTracks = tracks;
      listStatus.textContent = "";
      if (!tracks.length) {
        listStatus.appendChild(infoText("Пока нет скачиваний."));
      } else {
        for (const t of tracks) {
          list.appendChild(trackItem(t, { own: false, scope: "top" }));
        }
      }
    } catch {
      listStatus.textContent = "";
      listStatus.appendChild(infoText("Не удалось загрузить топ."));
    }
    try { window.dispatchEvent(new Event("spotx:render")); } catch {}
  }

  async function viewPublic() {
    setPageCleanup(null);
    document.title = "Треки - SpotX";
    const pageSize = 10;
    const pager = { offset: 0, hasMore: true, loading: false, total: 0, error: null };
    state.publicTracks = [];

    const countNode = el("div", { class: "section-count" }, ["0 треков"]);
    const head = el("div", { class: "section-head" }, [
      el("h2", { class: "section-title" }, ["Треки"]),
      countNode,
    ]);
    const list = el("div", { class: "tracks-list" }, []);
    const listStatus = el("div");

    const main = el("div", {}, [head, list, listStatus]);
    shell({ subtitle: "Треки", actions: topNav("tracks"), main, sidebar: userSideCard() });

    const renderList = () => {
      list.innerHTML = "";
      for (const track of state.publicTracks) {
        list.appendChild(trackItem(track, { own: false, scope: "public" }));
      }

      if (pager.hasMore) {
        list.appendChild(loadMoreItem(loadMore, pager.loading));
      }

      if (pager.total > 0 || !pager.hasMore) countNode.textContent = `${state.publicTracks.length} из ${pager.total} треков`;
      else countNode.textContent = `${state.publicTracks.length} треков`;

      listStatus.innerHTML = "";
      if (pager.error) {
        listStatus.appendChild(errorText(pager.error));
      } else if (!state.publicTracks.length && !pager.loading) {
        listStatus.appendChild(infoText("Пока нет публичных треков."));
      }

      try {
        window.dispatchEvent(new Event("spotx:render"));
      } catch {}
    };

    async function loadMore() {
      if (pager.loading || !pager.hasMore) return;
      pager.loading = true;
      pager.error = null;
      renderList();
      try {
        const url = `/api/tracks/public?limit=${pageSize}&offset=${pager.offset}`;
        const data = await apiJson(url, { method: "GET" });
        const items = Array.isArray(data.items) ? data.items : [];
        state.publicTracks.push(...items);
        pager.offset += items.length;
        pager.total = Number.isFinite(data.total) ? Number(data.total) : pager.total;
        if (typeof data.hasMore === "boolean") pager.hasMore = data.hasMore;
        else pager.hasMore = items.length === pageSize;
      } catch (err) {
        pager.error = err.message || "Не удалось загрузить треки";
      } finally {
        pager.loading = false;
        renderList();
      }
    }

    await loadMore();
  }

  async function viewSearch() {
    document.title = "Поиск - SpotX";
    const isMobileSearch = window.matchMedia("(max-width:980px)").matches;

    const defaultView = { sort: "new", coverOnly: false, descOnly: false, minePrivacy: "all" };
    if (!state.search || !state.search.view) state.search = { ...(state.search || {}), view: { ...defaultView } };
    const getView = () => ({ ...defaultView, ...(state.search?.view || {}) });

    const qInput = el("input", {
      class: "input search-input",
      placeholder: "Введите запрос",
      value: state.search?.q || "",
      onkeydown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void runSearch({ scope: "public", by: "title" });
        }
      },
    });

    const msg = el("div");
    const resultsWrap = el("div", { style: "margin-top:14px;" }, []);

    const renderResults = () => {
      resultsWrap.innerHTML = "";
      const s = state.search || { items: [], scope: "public", didSearch: false };
      const itemsRaw = Array.isArray(s.items) ? s.items : [];
      const isMine = s.scope === "mine";
      // Ensure card layout matches the destination pages:
      // public searches => same card as /tracks, mine search => same card as /profile.
      const own = isMine;
      const scopeKey = isMine ? "mine" : "public";
      const view = getView();

      let items = itemsRaw.slice();
      if (view.coverOnly) items = items.filter((t) => !!t?.coverFilename);
      if (view.descOnly) items = items.filter((t) => String(t?.description || "").trim().length > 0);
      if (isMine && view.minePrivacy !== "all") {
        const wantPublic = view.minePrivacy === "public";
        items = items.filter((t) => (!!t?.is_public) === wantPublic);
      }

      const getTs = (t) => {
        const v = t?.createdAt;
        const ms = v ? new Date(v).getTime() : NaN;
        return isNaN(ms) ? 0 : ms;
      };
      const getTitle = (t) => String(t?.title || "").toLowerCase();
      const getAuthor = (t) => String(t?.owner_name || "").toLowerCase();
      if (view.sort === "new") items.sort((a, b) => getTs(b) - getTs(a));
      else if (view.sort === "old") items.sort((a, b) => getTs(a) - getTs(b));
      else if (view.sort === "title_az") items.sort((a, b) => getTitle(a).localeCompare(getTitle(b), "ru"));
      else if (view.sort === "author_az") items.sort((a, b) => getAuthor(a).localeCompare(getAuthor(b), "ru"));

      if (!s.didSearch) {
        resultsWrap.appendChild(infoText("Введите запрос и выберите тип поиска."));
        return;
      }

      const head = el("div", { class: "section-head" }, [
        el("h2", { class: "section-title" }, ["Результаты"]),
        el("div", { class: "section-count" }, [`${items.length} треков`]),
      ]);
      resultsWrap.appendChild(head);

      if (!items.length) {
        resultsWrap.appendChild(infoText("Ничего не найдено."));
        return;
      }

      const list = el("div", { class: "tracks-list" }, items.map((t) => trackItem(t, { own, scope: scopeKey })));
      resultsWrap.appendChild(list);
    };

    async function runSearch({ scope, by }) {
      msg.innerHTML = "";
      const q = (qInput.value || "").trim();
      if (!q) return msg.appendChild(errorText("Введите запрос"));

      if (scope === "mine" && !state.user) return navigate("/auth/login", { replace: true });

      const busy = (v) => {
        qInput.disabled = !!v;
        btnAuthor.disabled = !!v;
        btnTitle.disabled = !!v;
        btnMine.disabled = !!v;
      };

      busy(true);
      msg.appendChild(loadingRow("Поиск..."));
      try {
        let url = "";
        if (scope === "mine") url = `/api/search/mine?q=${encodeURIComponent(q)}`;
        else url = `/api/search/public?q=${encodeURIComponent(q)}&by=${encodeURIComponent(by || "title")}`;

        const data = await apiJson(url, { method: "GET" });
        const items = Array.isArray(data.items) ? data.items : [];

        const view = state.search?.view ? { ...state.search.view } : { ...defaultView };
        state.search = { q, scope, by: scope === "mine" ? "mine" : by || "title", items, didSearch: true, view };
        if (scope === "mine") state.myTracks = items;
        else state.publicTracks = items;

        msg.innerHTML = "";
        renderResults();
        if (isMobileSearch) {
          searchPanelCollapsed = true;
          syncSearchPanel();
        }
        // Let auxiliary scripts (audio player) re-index buttons on dynamic updates.
        try {
          window.dispatchEvent(new Event("spotx:render"));
        } catch {}
      } catch (err) {
        msg.innerHTML = "";
        msg.appendChild(errorText(err.message || "Ошибка поиска"));
      } finally {
        busy(false);
      }
    }

    const btnAuthor = el(
      "button",
      { class: "small-btn", type: "button", onclick: () => runSearch({ scope: "public", by: "author" }) },
      ["Поиск по автору"]
    );
    const btnTitle = el(
      "button",
      { class: "small-btn", type: "button", onclick: () => runSearch({ scope: "public", by: "title" }) },
      ["Поиск по названию"]
    );
    const btnMine = el(
      "button",
      { class: "small-btn", type: "button", onclick: () => runSearch({ scope: "mine", by: "title" }) },
      ["Поиск по своим трекам"]
    );

    const actions = el("div", { class: "search-actions" }, [
      el("div", { class: "search-actions-row" }, [btnAuthor, btnTitle]),
      el("div", { class: "search-actions-row" }, [btnMine]),
    ]);

    const sortSel = el("select", { class: "input filter-select" }, [
      el("option", { value: "new" }, ["Сначала новые"]),
      el("option", { value: "old" }, ["Сначала старые"]),
      el("option", { value: "title_az" }, ["По названию (A-Z)"]),
      el("option", { value: "author_az" }, ["По автору (A-Z)"]),
    ]);

    const coverOnly = el("input", { type: "checkbox", class: "filter-checkbox" });
    const descOnly = el("input", { type: "checkbox", class: "filter-checkbox" });

    const minePrivacySel = el("select", { class: "input filter-select" }, [
      el("option", { value: "all" }, ["Все"]),
      el("option", { value: "public" }, ["Только публичные"]),
      el("option", { value: "private" }, ["Только приватные"]),
    ]);

    const rerenderAndSync = () => {
      renderResults();
      try {
        window.dispatchEvent(new Event("spotx:render"));
      } catch {}
    };

    sortSel.addEventListener("change", () => {
      const view = getView();
      view.sort = sortSel.value || "new";
      state.search.view = view;
      rerenderAndSync();
    });
    coverOnly.addEventListener("change", () => {
      const view = getView();
      view.coverOnly = !!coverOnly.checked;
      state.search.view = view;
      rerenderAndSync();
    });
    descOnly.addEventListener("change", () => {
      const view = getView();
      view.descOnly = !!descOnly.checked;
      state.search.view = view;
      rerenderAndSync();
    });
    minePrivacySel.addEventListener("change", () => {
      const view = getView();
      view.minePrivacy = minePrivacySel.value || "all";
      state.search.view = view;
      rerenderAndSync();
    });

    const applyViewToControls = () => {
      const view = getView();
      sortSel.value = view.sort || "new";
      coverOnly.checked = !!view.coverOnly;
      descOnly.checked = !!view.descOnly;
      minePrivacySel.value = view.minePrivacy || "all";
    };
    applyViewToControls();

    const filterBlock = el("div", { class: isMobileSearch ? "card filter-block search-filter-inline" : "card filter-block" }, [
      el("h3", {}, ["Сортировка и фильтры"]),
      infoText("Применяются к текущим результатам поиска."),
      el("div", { class: "filter-row" }, [el("div", {}, ["Сортировка"]), el("div", { style: "flex:1;" }, [sortSel])]),
      el("div", { class: "filter-row" }, [el("div", {}, ["Только с обложкой"]), coverOnly]),
      el("div", { class: "filter-row" }, [el("div", {}, ["Только с описанием"]), descOnly]),
      el("div", { class: "filter-row" }, [el("div", {}, ["Мои треки: доступ"]), el("div", { style: "flex:1;" }, [minePrivacySel])]),
    ]);

    const searchPanel = el("div", { class: "search-panel" }, [
      el("div", { class: "upload-form" }, [qInput, actions, msg]),
      isMobileSearch ? filterBlock : null,
    ]);
    const searchToggleBtn = el("button", {
      class: "search-panel-toggle",
      type: "button",
      "aria-label": "Скрыть поиск и фильтры",
      title: "Скрыть поиск и фильтры",
    }, ["▴"]);
    let searchPanelCollapsed = false;
    const syncSearchPanel = () => {
      searchPanel.style.display = searchPanelCollapsed ? "none" : "";
      if (isMobileSearch) {
        searchToggleBtn.style.display = "inline-flex";
        const show = searchPanelCollapsed;
        searchToggleBtn.textContent = show ? "▾" : "▴";
        searchToggleBtn.setAttribute("aria-label", show ? "Показать поиск и фильтры" : "Скрыть поиск и фильтры");
        searchToggleBtn.title = show ? "Показать поиск и фильтры" : "Скрыть поиск и фильтры";
      } else {
        searchToggleBtn.style.display = "none";
      }
    };
    searchToggleBtn.addEventListener("click", () => {
      searchPanelCollapsed = !searchPanelCollapsed;
      syncSearchPanel();
    });

    const titleRow = el("div", { class: "search-title-row" }, [
      el("h2", { style: "margin:0;" }, ["Поиск"]),
      searchToggleBtn,
    ]);

    const main = el("div", {}, [titleRow, searchPanel, resultsWrap]);

    renderResults();
    if (isMobileSearch && state.search?.didSearch) {
      searchPanelCollapsed = true;
    }
    syncSearchPanel();

    shell({
      subtitle: "Поиск",
      actions: topNav("search"),
      main,
      sidebar: isMobileSearch ? el("div") : filterBlock,
    });
  }

  async function viewLogin() {
    document.title = "Вход - SpotX";
    if (state.user) return navigate("/profile", { replace: true });
    const email = el("input", { class: "input", type: "email", placeholder: "Email", required: "1" });
    const password = el("input", { class: "input", type: "password", placeholder: "Пароль", required: "1" });
    const msg = el("div");
    let pending = false;
    const submit = el("button", { class: "upload-btn", type: "submit" }, ["Войти"]);

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (pending) return;
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if ((password.value || "").length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        pending = true;
        email.disabled = true;
        password.disabled = true;
        submit.disabled = true;
        msg.appendChild(loadingRow("Проверяем..."));
        try {
          state.user = await apiJson("/api/auth/login", { method: "POST", body: JSON.stringify({ email: email.value, password: password.value }) });
          state.userLoaded = true;
          navigate("/profile");
        } catch (err) {
          msg.innerHTML = "";
          msg.appendChild(errorText(err.message || "Ошибка входа"));
        } finally {
          pending = false;
          email.disabled = false;
          password.disabled = false;
          submit.disabled = false;
        }
      },
    }, [email, password, submit, msg]);

    shell({
      subtitle: "Вход",
      actions: [el("a", { class: "small-btn", href: "/auth/register", "data-link": "1" }, ["Регистрация"]), el("a", { class: "small-btn", href: "/auth/forgot-password", "data-link": "1" }, ["Забыли пароль?"])],
      main: el("div", {}, [el("h2", {}, ["Вход"]), form]),
      sidebar: el("div", { class: "card" }, [infoText("После успешного входа вы попадете в профиль.")]),
    });
  }

  async function viewRegister() {
    document.title = "Регистрация - SpotX";
    if (state.user) return navigate("/profile", { replace: true });
    const email = el("input", { class: "input", type: "email", placeholder: "Email", required: "1" });
    const name = el("input", { class: "input", placeholder: "Имя", required: "1" });
    const recoveryQuestion = recoveryQuestionSelect("register-question");
    const recoveryAnswer = el("input", { class: "input", placeholder: "Ответ на вопрос", required: "1" });
    const password = el("input", { class: "input", type: "password", placeholder: "Пароль (мин. 6)", required: "1" });
    const password2 = el("input", { class: "input", type: "password", placeholder: "Повторите пароль", required: "1" });
    const msg = el("div");
    let pending = false;
    const submit = el("button", { class: "upload-btn", type: "submit" }, ["Зарегистрироваться"]);
    const recoveryGroup = el("div", { class: "recovery-group" }, [
      field("Секретный вопрос", recoveryQuestion),
      field("Ответ", recoveryAnswer),
    ]);

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (pending) return;
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if ((name.value || "").trim().length < 2) return msg.appendChild(errorText("Имя должно содержать минимум 2 символа"));
        if (!RECOVERY_QUESTIONS.includes(recoveryQuestion.value)) return msg.appendChild(errorText("Выберите корректный секретный вопрос"));
        if ((recoveryAnswer.value || "").trim().length < 2) return msg.appendChild(errorText("Ответ на секретный вопрос слишком короткий"));
        if ((password.value || "").length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        if (password.value !== password2.value) return msg.appendChild(errorText("Пароли не совпадают"));
        pending = true;
        email.disabled = true;
        name.disabled = true;
        recoveryQuestion.disabled = true;
        recoveryAnswer.disabled = true;
        password.disabled = true;
        password2.disabled = true;
        submit.disabled = true;
        msg.appendChild(loadingRow("Регистрируем..."));
        try {
          const data = await apiJson("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({
              email: email.value,
              name: name.value,
              password: password.value,
              recoveryQuestion: recoveryQuestion.value,
              recoveryAnswer: recoveryAnswer.value,
            }),
          });
          state.user = { id: data.id, email: data.email, name: data.name, createdAt: data.createdAt, avatarFilename: data.avatarFilename || null };
          state.userLoaded = true;
          navigate("/profile");
        } catch (err) {
          msg.innerHTML = "";
          msg.appendChild(errorText(err.message || "Ошибка регистрации"));
        } finally {
          pending = false;
          email.disabled = false;
          name.disabled = false;
          recoveryQuestion.disabled = false;
          recoveryAnswer.disabled = false;
          password.disabled = false;
          password2.disabled = false;
          submit.disabled = false;
        }
      },
    }, [email, name, recoveryGroup, password, password2, submit, msg]);

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
    const recoveryQuestion = recoveryQuestionSelect("forgot-question");
    const recoveryAnswer = el("input", { class: "input", placeholder: "Ответ на вопрос", required: "1" });
    const password = el("input", { class: "input", type: "password", placeholder: "Новый пароль (мин. 6)", required: "1" });
    const password2 = el("input", { class: "input", type: "password", placeholder: "Повторите новый пароль", required: "1" });
    const msg = el("div");
    let pending = false;
    const submit = el("button", { class: "upload-btn", type: "submit" }, ["Сменить пароль"]);

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (pending) return;
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if (!RECOVERY_QUESTIONS.includes(recoveryQuestion.value)) return msg.appendChild(errorText("Выберите корректный секретный вопрос"));
        if ((recoveryAnswer.value || "").trim().length < 2) return msg.appendChild(errorText("Ответ на секретный вопрос слишком короткий"));
        if ((password.value || "").length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        if (password.value !== password2.value) return msg.appendChild(errorText("Пароли не совпадают"));
        pending = true;
        email.disabled = true;
        recoveryQuestion.disabled = true;
        recoveryAnswer.disabled = true;
        password.disabled = true;
        password2.disabled = true;
        submit.disabled = true;
        msg.appendChild(loadingRow("Отправляем..."));
        try {
          await apiJson("/api/auth/reset-password", {
            method: "POST",
            body: JSON.stringify({
              email: email.value,
              recoveryQuestion: recoveryQuestion.value,
              recoveryAnswer: recoveryAnswer.value,
              newPassword: password.value,
            }),
          });
          msg.innerHTML = "";
          msg.appendChild(infoText("Пароль изменен. Теперь войдите."));
          msg.appendChild(el("div", { style: "margin-top:10px;" }, [el("a", { class: "public-btn", href: "/auth/login", "data-link": "1" }, ["Вход"])]));
        } catch (err) {
          msg.innerHTML = "";
          msg.appendChild(errorText(err.message || "Ошибка"));
        } finally {
          pending = false;
          email.disabled = false;
          recoveryQuestion.disabled = false;
          recoveryAnswer.disabled = false;
          password.disabled = false;
          password2.disabled = false;
          submit.disabled = false;
        }
      },
    }, [email, field("Секретный вопрос", recoveryQuestion), field("Ответ на секретный вопрос", recoveryAnswer), password, password2, submit, msg]);

    shell({
      subtitle: "Восстановление пароля",
      actions: [el("a", { class: "small-btn", href: "/auth/login", "data-link": "1" }, ["Вход"]), el("a", { class: "small-btn", href: "/auth/register", "data-link": "1" }, ["Регистрация"])],
      main: el("div", {}, [el("h2", {}, ["Сброс пароля"]), form]),
      sidebar: el("div", { class: "card" }, [infoText("Введите email, секретный вопрос, ответ и новый пароль.")]),
    });
  }

  async function viewProfile() {
    setPageCleanup(null);
    document.title = "Профиль - SpotX";
    if (!state.user) return navigate("/auth/login", { replace: true });
    const pageSize = 10;
    const pager = { offset: 0, hasMore: true, loading: false, total: 0, error: null };
    state.myTracks = [];

    const list = el("div", { class: "tracks-list" }, []);
    const listStatus = el("div");

    const countNode = el("div", { class: "section-count" }, ["0 треков"]);
    const head = el("div", { class: "section-head" }, [
      el("h2", { class: "section-title" }, ["Ваши треки"]),
      countNode,
    ]);
    const main = el("div", {}, [head, list, listStatus]);

    const side = el("div", { class: "sidebar-stack" }, [
      el("div", { class: "card profile-header profile-mobile-user" }, [
        avatarLinkNode(state.user),
        el("div", { class: "profile-mobile-meta" }, [
          el("p", { class: "user-name" }, [state.user.name]),
          el("div", { class: "user-actions" }, [
            el("a", { class: "small-btn", href: "/profile/settings", "data-link": "1" }, ["Настройки"]),
            el("button", { class: "logout-btn", type: "button", onclick: logout }, ["Выйти"]),
          ]),
        ]),
      ]),
      el("div", { class: "card profile-mobile-upload" }, [
        el("h3", { style: "margin-top:0;" }, ["Загрузка треков"]),
        infoText("Перейдите на страницу загрузки нового трека."),
        el("a", { class: "public-btn", href: "/tracks/upload", "data-link": "1" }, ["Перейти к загрузке"]),
      ]),
    ]);

    shell({ subtitle: "Профиль", actions: topNav("profile"), main, sidebar: side });

    const renderList = () => {
      list.innerHTML = "";
      for (const track of state.myTracks) {
        list.appendChild(trackItem(track, { own: true, scope: "mine" }));
      }

      if (pager.hasMore) {
        list.appendChild(loadMoreItem(loadMore, pager.loading));
      }

      if (pager.total > 0 || !pager.hasMore) countNode.textContent = `${state.myTracks.length} из ${pager.total} треков`;
      else countNode.textContent = `${state.myTracks.length} треков`;

      listStatus.innerHTML = "";
      if (pager.error) {
        listStatus.appendChild(errorText(pager.error));
      } else if (!state.myTracks.length && !pager.loading) {
        listStatus.appendChild(infoText("У вас пока нет загруженных треков."));
      }

      try {
        window.dispatchEvent(new Event("spotx:render"));
      } catch {}
    };

    async function loadMore() {
      if (pager.loading || !pager.hasMore) return;
      pager.loading = true;
      pager.error = null;
      renderList();
      try {
        const url = `/api/tracks/mine?limit=${pageSize}&offset=${pager.offset}`;
        const data = await apiJson(url, { method: "GET" });
        const items = Array.isArray(data.items) ? data.items : [];
        state.myTracks.push(...items);
        pager.offset += items.length;
        pager.total = Number.isFinite(data.total) ? Number(data.total) : pager.total;
        if (typeof data.hasMore === "boolean") pager.hasMore = data.hasMore;
        else pager.hasMore = items.length === pageSize;
      } catch (err) {
        pager.error = err.message || "Не удалось загрузить треки";
      } finally {
        pager.loading = false;
        renderList();
      }
    }

    await loadMore();
  }

  async function viewSettings() {
    document.title = "Настройки - SpotX";
    if (!state.user) return navigate("/auth/login", { replace: true });
    shell({
      subtitle: "Настройки профиля",
      actions: topNav("profile"),
      main: el("div", {}, [el("h2", {}, ["Настройки"]), loadingRow("Загружаем настройки...")]),
      sidebar: userSideCard(),
    });
    const data = await apiJson("/api/profile/settings", { method: "GET" });
    if (data?.avatarFilename !== undefined) state.user.avatarFilename = data.avatarFilename;

    const email = el("input", { id: "settings-email", class: "input", type: "email", placeholder: "name@example.com", value: data.email || "" });
    const name = el("input", { id: "settings-name", class: "input", placeholder: "Ваше имя", value: data.name || "" });
    const recoveryQuestion = recoveryQuestionSelect("settings-question", data.recoveryQuestion || RECOVERY_QUESTIONS[0]);
    const recoveryAnswer = el("input", { id: "settings-answer", class: "input", placeholder: "Ответ на вопрос", value: data.recoveryAnswer || "" });
    const pass = el("input", { id: "settings-pass", class: "input", type: "password", placeholder: "Оставьте пустым, если не меняете" });
    const pass2 = el("input", { id: "settings-pass2", class: "input", type: "password", placeholder: "Повторите новый пароль" });
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
        if (!RECOVERY_QUESTIONS.includes(recoveryQuestion.value)) return msg.appendChild(errorText("Выберите корректный секретный вопрос"));
        if ((recoveryAnswer.value || "").trim().length < 2) return msg.appendChild(errorText("Ответ на секретный вопрос слишком короткий"));
        if (pass.value && pass.value.length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        if (pass.value && pass.value !== pass2.value) return msg.appendChild(errorText("Пароли не совпадают"));

        const fd = new FormData();
        fd.set("email", email.value);
        fd.set("name", name.value);
        fd.set("recovery_question", recoveryQuestion.value);
        fd.set("recovery_answer", recoveryAnswer.value);
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
      field("Секретный вопрос", recoveryQuestion, { help: "Выберите вопрос для восстановления доступа." }),
      field("Ответ на секретный вопрос", recoveryAnswer, { help: "Используется вместе с вопросом при сбросе пароля." }),
      field("Новый пароль", pass, { help: "Минимум 6 символов. Оставьте пустым, если не меняете." }),
      field("Повторите новый пароль", pass2),
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
    if (!Array.isArray(state.uploadSessionTracks)) state.uploadSessionTracks = [];
    if (!state.uploadDraft) {
      state.uploadDraft = {
        title: "",
        description: "",
        coverFile: null,
        coverFileName: "",
        audioFile: null,
        audioFileName: "",
      };
    }
    const draft = state.uploadDraft;

    const tracksHost = el("div", {}, [infoText("В этой сессии пока ничего не загружено.")]);
    const tracksCard = el("div", { class: "card sidebar-tracks-card" }, [
      el("h3", { style: "margin-top:0;" }, ["Добавлено в этой сессии"]),
      tracksHost,
    ]);

    const renderTracks = () => {
      tracksHost.innerHTML = "";
      if (!state.uploadSessionTracks.length) {
        tracksHost.appendChild(infoText("В этой сессии пока ничего не загружено."));
        try {
          window.dispatchEvent(new Event("spotx:render"));
        } catch {}
        return;
      }
      const list = el("div", { class: "tracks-list tracks-list-sidebar" }, []);
      for (const track of state.uploadSessionTracks) {
        list.appendChild(trackItem(track, { own: true, scope: "mine" }));
      }
      tracksHost.appendChild(list);
      try {
        window.dispatchEvent(new Event("spotx:render"));
      } catch {}
    };

    const title = el("input", { class: "input", placeholder: "Название трека", required: "1" });
    const description = el("textarea", { class: "input textarea", placeholder: "Описание (необязательно)", rows: "4" });
    const cover = el("input", { class: "file-input file-input-hidden", type: "file", accept: "image/*" });
    // Custom file picker UI (native input hidden).
    const file = el("input", { class: "file-input file-input-hidden", type: "file", accept: "audio/*" });
    const msg = el("div");

    const coverName = el("div", { class: "avatar-file" }, ["Обложка не выбрана"]);
    const coverPick = el("button", { class: "avatar-change-btn", type: "button", onclick: () => cover.click() }, ["Выбрать обложку"]);
    const coverPreview = el("div", { class: "cover-preview" }, [el("div", { class: "cover-placeholder" }, ["No cover"])]);
    title.value = draft.title || "";
    description.value = draft.description || "";
    cover.addEventListener("change", () => {
      const f = cover.files && cover.files[0];
      draft.coverFile = f || null;
      draft.coverFileName = f ? f.name : "";
      coverName.textContent = f ? f.name : "Обложка не выбрана";
      if (!f) return;
      const url = URL.createObjectURL(f);
      coverPreview.innerHTML = "";
      coverPreview.appendChild(el("img", { class: "cover-image", src: url, alt: "Обложка трека" }));
    });

    const fileName = el("div", { class: "avatar-file" }, ["Файл не выбран"]);
    const pick = el("button", { class: "avatar-change-btn", type: "button", onclick: () => file.click() }, ["Выбрать аудио"]);
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      draft.audioFile = f || null;
      draft.audioFileName = f ? f.name : "";
      fileName.textContent = f ? f.name : "Файл не выбран";
    });
    if (draft.coverFile) {
      coverName.textContent = draft.coverFileName || draft.coverFile.name || "Обложка не выбрана";
      const url = URL.createObjectURL(draft.coverFile);
      coverPreview.innerHTML = "";
      coverPreview.appendChild(el("img", { class: "cover-image", src: url, alt: "Обложка трека" }));
      restoreFileInput(cover, draft.coverFile);
    }
    if (draft.audioFile) {
      fileName.textContent = draft.audioFileName || draft.audioFile.name || "Файл не выбран";
      restoreFileInput(file, draft.audioFile);
    }

    const filePicker = el("div", { class: "field" }, [
      el("div", { class: "field-label" }, ["Аудиофайл"]),
      el("div", { class: "card", style: "padding:12px;display:flex;gap:10px;align-items:center;width:100%;" }, [
        pick,
        fileName,
      ]),
      el("p", { class: "field-help" }, ["Поддерживаются любые аудиофайлы, которые воспроизводит браузер (mp3/ogg/wav и т.д.)."]),
    ]);

    const coverPicker = el("div", { class: "field" }, [
      el("div", { class: "field-label" }, ["Обложка (необязательно)"]),
      el("div", { class: "settings-avatar-row" }, [
        coverPreview,
        el("div", { style: "display:flex;flex-direction:column;gap:10px;" }, [coverPick, coverName]),
      ]),
      el("p", { class: "field-help" }, ["jpg/png/webp/gif."]),
    ]);

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.innerHTML = "";
        if (!title.value.trim()) return msg.appendChild(errorText("Название трека обязательно"));
        if (!file.files || !file.files[0]) return msg.appendChild(errorText("Выберите файл"));
        draft.title = title.value;
        draft.description = description.value || "";

        const fd = new FormData();
        fd.set("title", title.value.trim());
        fd.set("description", (description.value || "").trim());
        fd.set("file", file.files[0]);
        if (cover.files && cover.files[0]) fd.set("cover", cover.files[0]);

        try {
          const res = await apiForm("/api/tracks/upload", fd);
          if (res?.track) {
            state.uploadSessionTracks.unshift(res.track);
            renderTracks();
          }
          msg.appendChild(infoText("Трек загружен"));
        } catch (err) {
          msg.appendChild(errorText(err.message || "Ошибка загрузки"));
        }
      },
    }, [
      field("Название трека", title),
      field("Описание", description, { help: "Будет показано в информации о треке." }),
      coverPicker,
      filePicker,
      cover,
      file,
      el("button", { class: "upload-btn", type: "submit" }, ["Загрузить"]),
      msg,
    ]);

    shell({
      subtitle: "Загрузка трека",
      actions: topNav("profile"),
      main: el("div", {}, [
        el("div", { class: "section-head" }, [
          el("h2", { class: "section-title" }, ["Добавить новый трек"]),
          el("a", { class: "small-btn", href: "/profile", "data-link": "1" }, ["В профиль"]),
        ]),
        form,
      ]),
      sidebar: tracksCard,
    });
    renderTracks();
  }

  async function viewTrackEdit(trackId) {
    document.title = "Изменение трека - SpotX";
    if (!state.user) return navigate("/auth/login", { replace: true });

    if (!state.myTracks.length) {
      shell({
        subtitle: "Изменение трека",
        actions: topNav("profile"),
        main: el("div", {}, [el("h2", {}, ["Изменение трека"]), loadingRow("Загружаем ваши треки...")]),
        sidebar: userSideCard(),
      });
      try {
        const data = await apiJson("/api/tracks/mine", { method: "GET" });
        state.myTracks = Array.isArray(data.items) ? data.items : [];
      } catch {}
    }

    const t = state.myTracks.find((x) => Number(x.id) === Number(trackId));
    if (!t) {
      shell({
        subtitle: "Изменение трека",
        actions: topNav("profile"),
        main: el("div", {}, [el("h2", {}, ["Трек не найден"]), infoText("Проверьте ссылку или войдите в свой аккаунт.")]),
        sidebar: el("div"),
      });
      return;
    }

    const title = el("input", { class: "input", placeholder: "Название трека", value: (t.title || "").trim() });
    const description = el("textarea", { class: "input textarea", rows: "6", placeholder: "Описание", value: (t.description || "").trim() });
    const cover = el("input", { class: "file-input file-input-hidden", type: "file", accept: "image/*" });

    let isPublic = !!t.is_public;
    const privacyIcon = el("span", { class: "pill-icon", html: isPublic ? ICON.unlock : ICON.lock }, []);
    const privacyText = el("span", { class: "pill-text" }, [isPublic ? "Публичный" : "Приватный"]);
    const privacyBtn = el(
      "button",
      {
        type: "button",
        class: `privacy-btn ${isPublic ? "privacy-public" : "privacy-private"}`,
        title: isPublic ? "Публичный" : "Приватный",
        onclick: () => {
          isPublic = !isPublic;
          privacyBtn.className = `privacy-btn ${isPublic ? "privacy-public" : "privacy-private"}`;
          privacyIcon.innerHTML = isPublic ? ICON.unlock : ICON.lock;
          privacyText.textContent = isPublic ? "Публичный" : "Приватный";
          privacyBtn.title = isPublic ? "Публичный" : "Приватный";
        },
      },
      [privacyIcon, privacyText]
    );

    const coverName = el("div", { class: "avatar-file" }, ["Обложка не выбрана"]);
    const coverPick = el("button", { class: "avatar-change-btn", type: "button", onclick: () => cover.click() }, ["Сменить обложку"]);
    const coverPreview = el("div", { class: "cover-preview" }, [
      t.coverFilename ? el("img", { class: "cover-image", src: `/media/${t.coverFilename}`, alt: "Обложка трека" }) : el("div", { class: "cover-placeholder" }, ["No cover"]),
    ]);
    cover.addEventListener("change", () => {
      const f = cover.files && cover.files[0];
      coverName.textContent = f ? f.name : "Обложка не выбрана";
      if (!f) return;
      const url = URL.createObjectURL(f);
      coverPreview.innerHTML = "";
      coverPreview.appendChild(el("img", { class: "cover-image", src: url, alt: "Обложка трека" }));
    });

    const msg = el("div");
    const save = el("button", { class: "upload-btn", type: "submit" }, ["Сохранить"]);
    const del = el("button", { class: "logout-btn", type: "button", style: "margin-left:auto;" }, ["Удалить трек"]);

    del.addEventListener("click", async () => {
      try {
        await apiJson(`/api/tracks/${t.id}`, { method: "DELETE" });
        navigate("/profile");
      } catch (err) {
        msg.innerHTML = "";
        msg.appendChild(errorText(err.message || "Ошибка"));
      }
    });

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.innerHTML = "";
        const titleVal = (title.value || "").trim();
        if (!titleVal) {
          msg.appendChild(errorText("Название трека обязательно"));
          return;
        }
        const fd = new FormData();
        fd.set("title", titleVal);
        fd.set("description", (description.value || "").trim());
        fd.set("is_public", isPublic ? "true" : "false");
        if (cover.files && cover.files[0]) fd.set("cover", cover.files[0]);
        try {
          const res = await apiFormAny(`/api/tracks/${t.id}`, "PATCH", fd);
          const updated = res?.track;
          if (updated) {
            Object.assign(t, updated);
            isPublic = !!t.is_public;
            privacyBtn.className = `privacy-btn ${isPublic ? "privacy-public" : "privacy-private"}`;
            privacyIcon.innerHTML = isPublic ? ICON.unlock : ICON.lock;
            privacyText.textContent = isPublic ? "Публичный" : "Приватный";
            privacyBtn.title = isPublic ? "Публичный" : "Приватный";
            if (t.coverFilename) {
              coverPreview.innerHTML = "";
              coverPreview.appendChild(el("img", { class: "cover-image", src: `/media/${t.coverFilename}`, alt: "Обложка трека" }));
            }
          }
          msg.appendChild(infoText("Сохранено"));
        } catch (err) {
          msg.appendChild(errorText(err.message || "Ошибка"));
        }
      },
    }, [
      el("h2", { style: "margin-top:0;" }, ["Изменить трек"]),
      field("Название", title),
      el("div", { class: "field" }, [
        el("div", { class: "field-label" }, ["Доступ"]),
        el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center;" }, [privacyBtn, el("span", { style: "color:var(--muted);font-size:13px;" }, ["(нажмите, чтобы переключить)"])]),
      ]),
      field("Описание", description),
      el("div", { class: "field" }, [
        el("div", { class: "field-label" }, ["Обложка"]),
        el("div", { class: "settings-avatar-row" }, [coverPreview, el("div", { style: "display:flex;flex-direction:column;gap:10px;" }, [coverPick, coverName])]),
      ]),
      cover,
      el("div", { style: "margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;" }, [save, del]),
      msg,
    ]);

    shell({
      subtitle: "Изменение трека",
      actions: topNav("profile"),
      main: form,
      sidebar: el("div", { class: "card" }, [
        infoText("Изменения применяются только к вашим трекам."),
        el("a", { class: "small-btn", href: "/profile", "data-link": "1" }, ["Назад в профиль"]),
      ]),
    });
  }

  async function viewNotFound() {
    setPageCleanup(null);
    document.title = "Страница не найдена - SpotX";

    shell({
      subtitle: "404",
      actions: topNav("home"),
      main: el("div", {}, [
        emptyStateCard({
          title: "Страница не найдена",
          text: "Адрес не существует или был удален. Проверьте ссылку или перейдите на главную.",
          actionHref: "/",
          actionLabel: "На главную",
        }),
      ]),
      sidebar: el("div", { class: "card" }, [
        infoText("Если это была старая ссылка, попробуйте открыть нужный раздел заново."),
      ]),
    });
  }

  async function renderRoute() {
    try {
      setPageCleanup(null);
      await loadMe();
      const path = window.location.pathname;
      await loadPageJs(path);
      const views = window.SpotXViews || {};
      const favoritesView = views.viewFavorites || window.SpotXViews?.viewFavorites;
      if (path === "/") return (views.viewHome || viewHome)();
      if (path === "/tracks") return (views.viewPublic || viewPublic)();
      if (path === "/favorites") return favoritesView ? favoritesView() : viewNotFound();
      if (path === "/search") return (views.viewSearch || viewSearch)();
      if (path === "/auth/login") return (views.viewLogin || viewLogin)();
      if (path === "/auth/register") return (views.viewRegister || viewRegister)();
      if (path === "/auth/forgot-password") return (views.viewForgot || viewForgot)();
      if (path === "/profile") return (views.viewProfile || viewProfile)();
      if (path === "/profile/settings") return (views.viewSettings || viewSettings)();
      if (path === "/tracks/upload") return (views.viewUpload || viewUpload)();
      const m = path.match(/^\/tracks\/(\d+)\/edit$/);
      if (m) return (views.viewTrackEdit || viewTrackEdit)(Number(m[1]));
      return viewNotFound();
    } catch (err) {
      const app = qs("#app");
      if (!app) return;
      const msg = String(err?.message || err || "Unknown error");
      const isNetwork = isNetworkOrServerError(err);
      app.innerHTML = "";
      if (isNetwork) {
        const retryBtn = el("button", { class: "public-btn", type: "button" }, ["Попробовать снова"]);
        retryBtn.addEventListener("click", () => { state.userLoaded = false; void renderRoute(); });
        app.appendChild(
          el("div", { class: "container" }, [
            el("div", { class: "card", style: "text-align:center;padding:32px 20px;" }, [
              el("h2", {}, ["Нет соединения"]),
              el("p", { style: "color:var(--muted);margin-top:8px;" }, [msg]),
              el("div", { style: "margin-top:16px;" }, [retryBtn]),
            ]),
          ])
        );
      } else {
        const stack = String(err?.stack || "");
        app.appendChild(
          el("div", { class: "container" }, [
            el("div", { class: "card" }, [
              el("h2", {}, ["Ошибка в клиентском коде"]),
              el("p", { style: "color:var(--muted)" }, ["Откройте DevTools Console, но ниже есть текст ошибки:"]),
              el("pre", { style: "white-space:pre-wrap;color:#fca5a5;background:rgba(255,255,255,0.03);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);" }, [msg + (stack ? "\n\n" + stack : "")]),
            ]),
            window.location.pathname === "/tracks/upload" ? null : footer(),
          ])
        );
      }
    }
  }

  document.addEventListener("click", async (e) => {
    const a = e.target.closest("a[data-link]");
    if (a) {
      const path = sameOriginPath(a.getAttribute("href") || "");
      if (path) {
        e.preventDefault();
        hideModal();
        navigate(path);
        return;
      }
    }

    const infoBtn = e.target.closest("button[data-action='track-info']");
    if (infoBtn) {
      const id = Number(infoBtn.getAttribute("data-track-id") || "0");
      const scope = infoBtn.getAttribute("data-scope") || "public";
      const list = tracksForScope(scope);
      const t = list.find((x) => Number(x.id) === id);
      if (!t) return;
      const isMine = scope === "mine";

      const descText = (t.description || "").trim();
      const coverNode = t.coverFilename
        ? el("img", { class: "modal-cover", src: `/media/${t.coverFilename}`, alt: "Обложка трека" })
        : el("div", { class: "modal-cover-placeholder" }, ["No cover"]);

      const deleteBtn = isMine
        ? el("button", {
            class: "logout-btn",
            type: "button",
            onclick: async () => {
              try {
                await apiJson(`/api/tracks/${t.id}`, { method: "DELETE" });
                hideModal();
                removeTrackFromState(t.id);
                document.querySelectorAll(`.track-item[data-track-id="${t.id}"]`).forEach((el) => el.remove());
              } catch (err) {
                alert(err.message || "Ошибка");
              }
            },
          }, ["Удалить"])
        : null;

      showModal(
        el("div", {}, [
          el("h3", { style: "margin-top:0;margin-bottom:10px;" }, ["Информация о треке"]),
          el("div", { class: "track-info-top" }, [
            el("div", { class: "track-info-cover" }, [coverNode]),
            el("div", { class: "track-info-main" }, [
              el("div", { class: "info-section-title" }, ["Основное"]),
              el("div", { class: "info-grid" }, [
                el("div", { class: "info-row info-row-title" }, [
                  el("div", { class: "info-k" }, ["Название"]),
                  el("div", { class: "info-v info-v-title" }, [t.title || "—"]),
                ]),
                el("div", { class: "info-row" }, [el("div", { class: "info-k" }, ["Дата загрузки"]), el("div", { class: "info-v" }, [t.createdAt ? fmtDate(t.createdAt) : "—"])]),
                el("div", { class: "info-row" }, [el("div", { class: "info-k" }, ["Скачиваний"]), el("div", { class: "info-v" }, [String(Number(t.downloadsCount ?? t.downloads ?? 0))])]),
                el("div", { class: "info-row" }, [el("div", { class: "info-k" }, ["В избранном"]), el("div", { class: "info-v" }, [String(Number(t.favoritesCount ?? t.favorites ?? 0))])]),
                isMine
                  ? el("div", { class: "info-row" }, [el("div", { class: "info-k" }, ["Доступ"]), el("div", { class: "info-v" }, [t.is_public ? "Публичный" : "Приватный"])])
                  : el("div", { class: "info-row" }, [el("div", { class: "info-k" }, ["Автор"]), el("div", { class: "info-v" }, [t.owner_name || "—"])]),
              ]),
            ]),
          ]),
          el("div", { class: "info-section-title" }, ["Описание"]),
          el("div", { class: "info-desc" }, [descText || "—"]),
          isMine
            ? el("div", { class: "modal-actions" }, [
                el("div", { class: "modal-actions-left" }, [
                  el("a", { class: "public-btn download-btn", href: `/media/${t.filename}`, download: "1", "data-track-id": String(t.id) }, ["Скачать файл"]),
                ]),
                el("div", { class: "modal-actions-right" }, [
                  el("a", { class: "small-btn edit-btn", href: `/tracks/${t.id}/edit`, "data-link": "1" }, ["Изменить"]),
                  deleteBtn,
                ]),
              ])
            : null,
        ])
      );
      return;
    }

    const btn = e.target.closest("button[data-action='toggle-privacy']");
    if (btn) {
      const id = btn.getAttribute("data-track-id");
      if (!id) return;
      try {
        const res = await apiJson(`/toggle_privacy/${id}`, { method: "POST", body: "{}" });
        updateTrackPrivacyInState(id, res?.is_public);
        refreshTrackItems(id);
      } catch (err) {
        alert(err.message || "Ошибка");
      }
      return;
    }

    const downloadLink = e.target.closest("a.download-btn[data-track-id]");
    if (downloadLink) {
      e.preventDefault();
      const trackId = downloadLink.getAttribute("data-track-id");
      const href = downloadLink.getAttribute("href");
      if (trackId) {
        try {
          const res = await apiJson(`/api/tracks/${trackId}/download`, { method: "POST", body: "{}" });
          updateTrackInState(trackId, (item) => {
            const count = res.downloadsCount ?? (Number(item.downloadsCount || item.downloads || 0) + 1);
            item.downloadsCount = count;
            item.downloads = count;
          });
          refreshTrackItems(trackId);
          // Modal context — update info row if visible
          const infoRows = document.querySelectorAll(".info-row");
          for (const row of infoRows) {
            const label = row.querySelector(".info-k");
            if (label && label.textContent === "Скачиваний") {
              const val = row.querySelector(".info-v");
              if (val) val.textContent = String(res.downloadsCount);
            }
          }
        } catch {
          // Silently proceed with download even if API fails
        }
      }
      // Trigger the actual file download
      if (href) {
        const a = document.createElement("a");
        a.href = href;
        a.download = "";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return;
    }

    const favoriteBtn = e.target.closest("button[data-action='toggle-favorite']");
    if (favoriteBtn) {
      const id = favoriteBtn.getAttribute("data-track-id");
      if (!id) return;
      const isFavorite = favoriteBtn.getAttribute("data-favorite") === "1";
      try {
        let res;
        if (isFavorite) {
          res = await apiJson(`/api/favorites/${id}`, { method: "DELETE", body: "{}" });
        } else {
          res = await apiJson(`/api/favorites/${id}`, { method: "POST", body: "{}" });
        }
        updateTrackFavoriteInState(id, !isFavorite);
        if (res.favoritesCount != null) {
          updateTrackInState(id, (item) => {
            item.favoritesCount = res.favoritesCount;
            item.favorites = res.favoritesCount;
          });
        }
        refreshTrackItems(id);
      } catch (err) {
        alert(err.message || "Ошибка");
      }
    }
  });

  window.addEventListener("popstate", () => void renderRoute());
  void renderRoute();
})();
