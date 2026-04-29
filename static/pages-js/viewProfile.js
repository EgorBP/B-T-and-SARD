window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewProfile =   async function viewProfile() {
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

