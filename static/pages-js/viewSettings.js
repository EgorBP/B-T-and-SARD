window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewSettings =   async function viewSettings() {
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

