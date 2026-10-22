const user = JSON.parse(localStorage.getItem("user") || "null");
if (!user) {
    window.location.href = "login.html";
} else {
    const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
    const apiBase = location.protocol === "file:" || (localHost && location.port !== "3000")
        ? `http://${localHost ? location.hostname : "localhost"}:3000` : "";
    const apiUrl = path => `${apiBase}${path}`;
    document.getElementById("welcomeText").textContent = `Welcome back, ${user.name || "Seller"}`;
    const cards = [...document.querySelectorAll(".card")];
    const table = document.querySelector(".table-box table");
    const tableBox = document.querySelector(".table-box");
    const body = document.createElement("tbody");
    const toolbar = document.createElement("div");
    toolbar.className = "dashboard-toolbar";
    toolbar.innerHTML = `
        <label class="dashboard-search">Search auctions <input id="auctionSearch" type="search" placeholder="Search by product"></label>
        <label>Status <select id="auctionStatus"><option value="all">All statuses</option><option value="active">Live</option><option value="scheduled">Upcoming</option><option value="ended">Ended</option></select></label>
        <button type="button" id="refreshDashboard">Refresh</button>`;
    tableBox.insertBefore(toolbar, table);
    const thead = document.createElement("thead");
    const heading = document.createElement("tr");
    ["Product", "Status", "Highest Bid"].forEach(label => { const th = document.createElement("th"); th.textContent = label; heading.append(th); });
    thead.append(heading); table.replaceChildren(thead, body);

    const search = toolbar.querySelector("#auctionSearch");
    const statusFilter = toolbar.querySelector("#auctionStatus");
    const notificationButton = document.getElementById("notificationsButton");
    const notificationBadge = document.getElementById("notificationBadge");
    const notificationPanel = document.getElementById("notificationPanel");
    const notificationList = document.getElementById("notificationList");
    const seenKey = `auctfy_seen_notifications_${user.id}`;
    const state = { auctions: [], bids: [], subscription: null, notifications: [] };
    const currency = value => `INR ${Number(value || 0).toLocaleString("en-IN")}`;

    function seenNotifications() {
        try { return new Set(JSON.parse(localStorage.getItem(seenKey) || "[]").map(String)); }
        catch { return new Set(); }
    }
    function updateBadge() {
        const seen = seenNotifications();
        const unread = state.notifications.filter(item => !seen.has(String(item.id))).length;
        notificationBadge.hidden = unread === 0;
        notificationBadge.textContent = unread > 9 ? "9+" : String(unread);
        notificationButton.setAttribute("aria-label", unread ? `${unread} unread notifications` : "Notifications");
    }
    function renderNotifications() {
        notificationList.replaceChildren();
        if (!state.notifications.length) {
            const empty = document.createElement("p"); empty.textContent = "No new bids on your auctions yet."; notificationList.append(empty); updateBadge(); return;
        }
        const seen = seenNotifications();
        state.notifications.forEach(item => {
            const entry = document.createElement("button");
            entry.type = "button"; entry.className = "notification-item";
            const title = document.createElement("span");
            title.textContent = `${item.bidder_name} bid ${currency(item.bid_amount)} on ${item.product_name}`;
            if (!seen.has(String(item.id))) title.style.fontWeight = "700";
            const time = document.createElement("small");
            time.textContent = item.created_at ? new Date(item.created_at.replace(" ", "T") + "Z").toLocaleString("en-IN") : "Recent";
            entry.append(title, time);
            entry.addEventListener("click", () => { location.href = `auction-details.html?id=${encodeURIComponent(item.auction_id)}`; });
            notificationList.append(entry);
        });
        updateBadge();
    }
    async function loadNotifications() {
        try {
            const response = await fetch(apiUrl(`/notifications/${encodeURIComponent(user.id)}`));
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || "Unable to load notifications.");
            state.notifications = data.notifications || [];
            renderNotifications();
        } catch (error) {
            notificationList.replaceChildren();
            const message = document.createElement("p"); message.textContent = error.message || "Unable to load notifications.";
            notificationList.append(message);
        }
    }
    function markNotificationsRead() {
        localStorage.setItem(seenKey, JSON.stringify(state.notifications.map(item => String(item.id))));
        updateBadge();
    }
    notificationButton.addEventListener("click", async () => {
        const opening = notificationPanel.hidden;
        notificationPanel.hidden = !opening;
        notificationButton.setAttribute("aria-expanded", String(opening));
        if (opening) { await loadNotifications(); markNotificationsRead(); }
    });
    document.addEventListener("click", event => {
        if (!notificationPanel.hidden && !notificationPanel.contains(event.target) && !notificationButton.contains(event.target)) {
            notificationPanel.hidden = true; notificationButton.setAttribute("aria-expanded", "false");
        }
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !notificationPanel.hidden) {
            notificationPanel.hidden = true; notificationButton.setAttribute("aria-expanded", "false"); notificationButton.focus();
        }
    });

    function renderAuctions() {
        const term = search.value.trim().toLowerCase();
        const filtered = state.auctions.filter(auction => {
            const status = String(auction.status || "").toLowerCase();
            return (statusFilter.value === "all" || status === statusFilter.value) && String(auction.product_name || "").toLowerCase().includes(term);
        });
        body.replaceChildren();
        if (!filtered.length) {
            const row = document.createElement("tr"); const cell = document.createElement("td");
            cell.colSpan = 3; cell.className = "dashboard-empty";
            cell.textContent = state.auctions.length ? "No auctions match these filters." : "You have not created any auctions yet.";
            row.append(cell); body.append(row); return;
        }
        filtered.slice(0, 8).forEach(auction => {
            const row = document.createElement("tr");
            const product = document.createElement("td"); product.textContent = auction.product_name;
            const status = document.createElement("td"); status.textContent = auction.status === "Active" ? "Live" : auction.status === "Scheduled" ? "Upcoming" : auction.status;
            const bid = document.createElement("td"); bid.textContent = currency(auction.highest_bid);
            row.append(product, status, bid); body.append(row);
        });
    }
    async function loadDashboard() {
        const refresh = toolbar.querySelector("#refreshDashboard"); refresh.disabled = true; refresh.textContent = "Loading...";
        try {
            const paths = [`/my-auctions/${encodeURIComponent(user.id)}`, `/my-bids/${encodeURIComponent(user.id)}`, `/subscription/${encodeURIComponent(user.id)}`];
            const responses = await Promise.all(paths.map(path => fetch(apiUrl(path))));
            const results = await Promise.all(responses.map(response => response.json()));
            const failed = responses.findIndex((response, index) => !response.ok || !results[index].success);
            if (failed !== -1) throw new Error(results[failed].message || "Unable to load dashboard data.");
            state.auctions = await Promise.all((results[0].auctions || []).map(async auction => {
                try {
                    const response = await fetch(apiUrl(`/auction/${encodeURIComponent(auction.id)}/highest-bid`));
                    const result = await response.json();
                    return { ...auction, highest_bid: result.highest_bid || auction.starting_price };
                } catch { return { ...auction, highest_bid: auction.starting_price }; }
            }));
            state.bids = results[1].bids || []; state.subscription = results[2].subscription;
            cards[0].querySelector("h2").textContent = state.auctions.length;
            cards[1].querySelector("h2").textContent = state.auctions.filter(auction => auction.status === "Active").length;
            cards[2].querySelector("h2").textContent = state.bids.length;
            cards[3].querySelector("h2").textContent = state.subscription ? "Premium" : "Free";
            renderAuctions();
        } catch (error) {
            console.error("Dashboard load error:", error);
            body.replaceChildren(); const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 3;
            cell.textContent = `${error.message || "Unable to load dashboard data."} Use Refresh to try again.`; row.append(cell); body.append(row);
        } finally { refresh.disabled = false; refresh.textContent = "Refresh"; }
    }
    cards.forEach((card, index) => {
        card.tabIndex = 0; card.setAttribute("role", "link");
        card.addEventListener("click", () => location.href = ["my-auctions.html", "my-auctions.html", "my-bids.html", "subscription.html"][index]);
        card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); card.click(); } });
    });
    search.addEventListener("input", renderAuctions);
    statusFilter.addEventListener("change", renderAuctions);
    toolbar.querySelector("#refreshDashboard").addEventListener("click", loadDashboard);
    loadDashboard(); loadNotifications();
    window.setInterval(loadNotifications, 60000);
}
