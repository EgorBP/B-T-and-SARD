window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewRegister =   async function viewRegister() {
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

