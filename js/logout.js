(function () {
    "use strict";

    const loggedIn = Boolean(localStorage.getItem("user"));
    let style = document.getElementById("site-logout-styles");
    if (!style) {
        style = document.createElement("style");
        style.id = "site-logout-styles";
        style.textContent = `
            .site-logout-action {
                position: fixed; top: 16px; right: 18px; z-index: 10000;
                display: inline-flex; align-items: center; gap: 8px;
                padding: 10px 15px; border: 1px solid #d7dce3; border-radius: 9px;
                background: #fff; color: #253247; font: 600 14px/1.2 Arial, sans-serif;
                text-decoration: none; box-shadow: 0 3px 12px rgba(20, 30, 50, .12);
                cursor: pointer;
            }
            .site-logout-action:hover { background: #f4f6fa; }
            [data-logout][hidden], [data-auth-login][hidden] { display: none !important; }
        `;
        document.head.append(style);
    }

    let actions = [...document.querySelectorAll("[data-logout]")];
    if (loggedIn && !actions.length && document.body) {
        const action = document.createElement("a");
        action.href = "login.html";
        action.className = "site-logout-action";
        action.setAttribute("data-logout", "");
        action.innerHTML = '<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span>Logout</span>';
        document.body.append(action);
        actions = [action];
    }

    actions.forEach(action => {
        action.hidden = !loggedIn;
        action.addEventListener("click", event => {
            event.preventDefault();
            localStorage.removeItem("user");
            window.location.assign(new URL("login.html", window.location.href).href);
        });
    });

    if (loggedIn) {
        document.querySelectorAll("[data-auth-login]").forEach(link => { link.hidden = true; });
    }
})();
