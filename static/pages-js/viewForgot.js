window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewForgot =   async function viewForgot() {
    document.title = "Восстановление пароля - SpotX";
    const email = el("input", { class: "input", type: "email", placeholder: "Email", required: "1" });
    const recoveryQuestion = recoveryQuestionSelect("forgot-question");
    const recoveryAnswer = el("input", { class: "input", placeholder: "Ответ на вопрос", required: "1" });
    const password = el("input", { class: "input", type: "password", placeholder: "Новый пароль (мин. 6)", required: "1" });
    const password2 = el("input", { class: "input", type: "password", placeholder: "Повторите новый пароль", required: "1" });
    const msg = el("div");
    let pending = false;
    const submit = el("button", { class: "upload-btn", type: "submit" }, ["Сменить пароль"]);

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (pending) return;
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if (!RECOVERY_QUESTIONS.includes(recoveryQuestion.value)) return msg.appendChild(errorText("Выберите корректный секретный вопрос"));
        if ((recoveryAnswer.value || "").trim().length < 2) return msg.appendChild(errorText("Ответ на секретный вопрос слишком короткий"));
        if ((password.value || "").length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        if (password.value !== password2.value) return msg.appendChild(errorText("Пароли не совпадают"));
        pending = true;
        email.disabled = true;
        recoveryQuestion.disabled = true;
        recoveryAnswer.disabled = true;
        password.disabled = true;
        password2.disabled = true;
        submit.disabled = true;
        msg.appendChild(loadingRow("Отправляем..."));
        try {
          await apiJson("/api/auth/reset-password", {
            method: "POST",
            body: JSON.stringify({
              email: email.value,
              recoveryQuestion: recoveryQuestion.value,
              recoveryAnswer: recoveryAnswer.value,
              newPassword: password.value,
            }),
          });
          msg.innerHTML = "";
          msg.appendChild(infoText("Пароль изменен. Теперь войдите."));
          msg.appendChild(el("div", { style: "margin-top:10px;" }, [el("a", { class: "public-btn", href: "/auth/login", "data-link": "1" }, ["Вход"])]));
        } catch (err) {
          msg.innerHTML = "";
          msg.appendChild(errorText(err.message || "Ошибка"));
        } finally {
          pending = false;
          email.disabled = false;
          recoveryQuestion.disabled = false;
          recoveryAnswer.disabled = false;
          password.disabled = false;
          password2.disabled = false;
          submit.disabled = false;
        }
      },
    }, [email, field("Секретный вопрос", recoveryQuestion), field("Ответ на секретный вопрос", recoveryAnswer), password, password2, submit, msg]);

    shell({
      subtitle: "Восстановление пароля",
      actions: [el("a", { class: "small-btn", href: "/auth/login", "data-link": "1" }, ["Вход"]), el("a", { class: "small-btn", href: "/auth/register", "data-link": "1" }, ["Регистрация"])],
      main: el("div", {}, [el("h2", {}, ["Сброс пароля"]), form]),
      sidebar: el("div", { class: "card" }, [infoText("Введите email, секретный вопрос, ответ и новый пароль.")]),
    });
  }

