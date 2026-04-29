window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewHome =   async function viewHome() {
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

