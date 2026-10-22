(function () {
    const toggle = document.getElementById("showAdminLogin");
    const panel = document.getElementById("adminLoginPanel");
    const form = panel;
    const status = document.getElementById("adminLoginStatus");
    if (!toggle || !form || !status) return;

    toggle.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute("aria-expanded", String(!panel.hidden));
        if (!panel.hidden) document.getElementById("adminUsername").focus();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        status.textContent = "Signing in…";
        try {
            const response = await fetch("/admin/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: document.getElementById("adminUsername").value.trim(),
                    password: document.getElementById("adminPassword").value
                })
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "Admin sign-in failed.");
            window.location.assign("admin-dashboard.html");
        } catch (error) {
            status.textContent = error instanceof TypeError
                ? "Start the AuctFy server and try again."
                : error.message || "Unable to sign in.";
        } finally {
            submit.disabled = false;
        }
    });
})();
