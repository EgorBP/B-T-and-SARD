window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewLogin =   async function viewLogin() {
    document.title = "Вход - SpotX";
    if (state.user) return navigate("/profile", { replace: true });
    const email = el("input", { class: "input", type: "email", placeholder: "Email", required: "1" });
    const password = el("input", { class: "input", type: "password", placeholder: "Пароль", required: "1" });
    const msg = el("div");
    let pending = false;
    const submit = el("button", { class: "upload-btn", type: "submit" }, ["Войти"]);

    const form = el("form", {
      class: "upload-form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (pending) return;
        msg.innerHTML = "";
        if (!validateEmail(email.value)) return msg.appendChild(errorText("Введите корректный email"));
        if ((password.value || "").length < 6) return msg.appendChild(errorText("Пароль должен быть не короче 6 символов"));
        pending = true;
        email.disabled = true;
        password.disabled = true;
        submit.disabled = true;
        msg.appendChild(loadingRow("Проверяем..."));
        try {
          state.user = await apiJson("/api/auth/login", { method: "POST", body: JSON.stringify({ email: email.value, password: password.value }) });
          state.userLoaded = true;
          navigate("/profile");
        } catch (err) {
          msg.innerHTML = "";
          msg.appendChild(errorText(err.message || "Ошибка входа"));
        } finally {
          pending = false;
          email.disabled = false;
          password.disabled = false;
          submit.disabled = false;
        }
      },
    }, [email, password, submit, msg]);

    shell({
      subtitle: "Вход",
      actions: [el("a", { class: "small-btn", href: "/auth/register", "data-link": "1" }, ["Регистрация"]), el("a", { class: "small-btn", href: "/auth/forgot-password", "data-link": "1" }, ["Забыли пароль?"])],
      main: el("div", {}, [el("h2", {}, ["Вход"]), form]),
      sidebar: el("div", { class: "card" }, [infoText("После успешного входа вы попадете в профиль.")]),
    });
  }

