window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewFavorites = async function viewFavorites() {
  setPageCleanup(null);
  document.title = "Избранное - SpotX";
  if (!state.user) return navigate("/auth/login", { replace: true });

  const pageSize = 10;
  const pager = { offset: 0, hasMore: true, loading: false, total: 0, error: null };
  state.favoriteTracks = [];

  const list = el("div", { class: "tracks-list" }, []);
  const listStatus = el("div");

  const countNode = el("div", { class: "section-count" }, ["0 треков"]);
  const head = el("div", { class: "section-head" }, [
    el("h2", { class: "section-title" }, ["Избранное"]),
    countNode,
  ]);

  const main = el("div", {}, [head, list, listStatus]);
  const side = el("div", { class: "sidebar-stack" }, [
    userSideCard(),
    el("div", { class: "card" }, [
      el("h3", { style: "margin-top:0;" }, ["Быстрый доступ"]),
      infoText("Здесь собраны треки, которые вы отметили сердцем."),
      el("div", { style: "display:flex;flex-direction:column;gap:8px;" }, [
        el("a", { class: "public-btn", href: "/tracks", "data-link": "1" }, ["К публичным трекам"]),
        el("a", { class: "small-btn", href: "/search", "data-link": "1" }, ["В поиск"]),
      ]),
    ]),
  ]);

  shell({ subtitle: "Избранное", actions: topNav("favorites"), main, sidebar: side });

  const renderList = () => {
    list.innerHTML = "";
    for (const track of state.favoriteTracks) {
      list.appendChild(trackItem(track, { own: false, scope: "favorites" }));
    }

    if (pager.hasMore) {
      list.appendChild(loadMoreItem(loadMore, pager.loading));
    }

    if (pager.total > 0 || !pager.hasMore) countNode.textContent = `${state.favoriteTracks.length} из ${pager.total} треков`;
    else countNode.textContent = `${state.favoriteTracks.length} треков`;

    listStatus.innerHTML = "";
    if (pager.error) {
      listStatus.appendChild(errorText(pager.error));
    } else if (!state.favoriteTracks.length && !pager.loading) {
      listStatus.appendChild(infoText("Пока нет избранных треков."));
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
      const url = `/api/favorites?limit=${pageSize}&offset=${pager.offset}`;
      const data = await apiJson(url, { method: "GET" });
      const items = Array.isArray(data.items) ? data.items : [];
      state.favoriteTracks.push(...items);
      pager.offset += items.length;
      pager.total = Number.isFinite(data.total) ? Number(data.total) : pager.total;
      if (typeof data.hasMore === "boolean") pager.hasMore = data.hasMore;
      else pager.hasMore = items.length === pageSize;
    } catch (err) {
      pager.error = err.message || "Не удалось загрузить избранное";
    } finally {
      pager.loading = false;
      renderList();
    }
  }

  await loadMore();
};
