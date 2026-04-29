window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewSearch =   async function viewSearch() {
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

