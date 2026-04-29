window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewPublic =   async function viewPublic() {
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

