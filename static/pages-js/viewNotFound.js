window.SpotXViews = window.SpotXViews || {};
window.SpotXViews.viewNotFound = async function viewNotFound() {
    setPageCleanup(null);
    document.title = "Страница не найдена - SpotX";

    const main = el("div", { class: "card" }, [
      el("h2", {}, ["Страница не найдена"]),
      el("p", { style: "color:var(--muted);line-height:1.6;" }, [
        "Адрес не существует или был удален. Проверьте ссылку или перейдите на главную.",
      ]),
      el("div", { style: "margin-top:14px;" }, [
        el("a", { class: "public-btn", href: "/", "data-link": "1" }, ["На главную"]),
      ]),
    ]);

    shell({
      subtitle: "404",
      actions: topNav("home"),
      main,
      sidebar: el("div", { class: "card" }, [
        infoText("Если это была старая ссылка, попробуйте открыть нужный раздел заново."),
      ]),
    });
  }
