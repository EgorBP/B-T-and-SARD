window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewHome = async function viewHome() {
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
};
