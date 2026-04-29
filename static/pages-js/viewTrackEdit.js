window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewTrackEdit =   async function viewTrackEdit(trackId) {
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

  async function renderRoute() {
    try {
      setPageCleanup(null);
      await loadMe();
      const path = window.location.pathname;
      if (path === "/") return viewHome();
      if (path === "/tracks") return viewPublic();
      if (path === "/search") return viewSearch();
      if (path === "/auth/login") return viewLogin();
      if (path === "/auth/register") return viewRegister();
      if (path === "/auth/forgot-password") return viewForgot();
      if (path === "/profile") return viewProfile();
      if (path === "/profile/settings") return viewSettings();
      if (path === "/tracks/upload") return viewUpload();
      const m = path.match(/^\/tracks\/(\d+)\/edit$/);
      if (m) return viewTrackEdit(Number(m[1]));
      return viewHome();
    } catch (err) {
      const app = qs("#app");
      if (app) {
        const msg = String(err?.message || err || "Unknown error");
        const stack = String(err?.stack || "");
        app.innerHTML = "";
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

