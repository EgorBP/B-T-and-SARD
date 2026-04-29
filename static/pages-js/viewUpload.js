window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewUpload =   async function viewUpload() {
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

