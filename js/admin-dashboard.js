(function () {
    const status = document.getElementById("dashboardStatus");
    const tbody = document.getElementById("usersTableBody");
    const refresh = document.getElementById("refreshDashboard");
    const logout = document.getElementById("adminLogout");

    function cell(text) {
        const td = document.createElement("td");
        td.textContent = text == null || text === "" ? "—" : String(text);
        return td;
    }

    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
    }

    async function loadOverview() {
        refresh.disabled = true;
        status.textContent = "Loading dashboard data…";
        try {
            const response = await fetch("/admin/overview", { cache: "no-store" });
            const data = await response.json();
            if (response.status === 401) {
                window.location.replace("index.html");
                return;
            }
            if (!response.ok || !data.success) throw new Error(data.message || "Unable to load dashboard data.");

            document.getElementById("totalUsers").textContent = Number(data.total_users || 0).toLocaleString();
            document.getElementById("totalAuctions").textContent = Number(data.total_auctions || 0).toLocaleString();
            document.getElementById("activeSubscriptions").textContent = Number(data.active_subscriptions || 0).toLocaleString();
            document.getElementById("completedAuctions").textContent = Number(data.completed_auctions || 0).toLocaleString();
            document.getElementById("scheduledAuctions").textContent = Number(data.scheduled_auctions || 0).toLocaleString();
            document.getElementById("usersCount").textContent = `${data.users.length} shown`;
            tbody.replaceChildren();
            if (!data.users.length) {
                const row = document.createElement("tr");
                const empty = cell("No registered users yet.");
                empty.colSpan = 4;
                row.append(empty);
                tbody.append(row);
            } else {
                data.users.forEach(user => {
                    const row = document.createElement("tr");
                    row.append(cell(`#${user.id}`), cell(user.full_name));
                    const subCell = cell(user.subscription_status);
                    const badge = document.createElement("span");
                    badge.className = `status-badge ${user.subscription_status === "Active" ? "is-active" : "is-inactive"}`;
                    badge.textContent = user.subscription_status;
                    subCell.replaceChildren(badge);
                    row.append(subCell, cell(formatDate(user.created_at)));
                    tbody.append(row);
                });
            }
            status.textContent = "Dashboard data is up to date.";
        } catch (error) {
            status.textContent = error instanceof TypeError
                ? "Cannot reach the server. Start AuctFy and refresh."
                : error.message || "Unable to load dashboard data.";
        } finally {
            refresh.disabled = false;
        }
    }

    refresh.addEventListener("click", loadOverview);
    logout.addEventListener("click", async () => {
        logout.disabled = true;
        try { await fetch("/admin/logout", { method: "POST" }); }
        finally { window.location.assign("index.html"); }
    });
    loadOverview();
})();
