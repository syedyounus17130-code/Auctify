(function () {
    const links = [
        ["dashboard.html", "Dashboard", "fa-house"],
        ["create-auction.html", "Create Auction", "fa-circle-plus"],
        ["my-auctions.html", "My Auctions", "fa-gavel"],
        ["my-bids.html", "My Bids", "fa-hand-holding-dollar"],
        ["browse-auctions.html", "Browse Auctions", "fa-magnifying-glass"],
        ["subscription.html", "Subscription", "fa-credit-card"],
        ["profile.html", "Profile", "fa-user"],
        ["login.html", "Logout", "fa-right-from-bracket", true]
    ];

    let sidebar = document.querySelector(".app-sidebar, .sidebar");
    if (!sidebar) {
        sidebar = document.createElement("aside");
        document.body.prepend(sidebar);
    }

    sidebar.className = "app-sidebar";
    sidebar.setAttribute("aria-label", "Main navigation");
    const currentPage = window.location.pathname.split("/").pop().toLowerCase() || "dashboard.html";
    sidebar.innerHTML = `
        <a class="sidebar-brand" href="dashboard.html"><i class="fa-solid fa-gavel" aria-hidden="true"></i><span>AuctFy</span></a>
        <nav aria-label="Site">
            <ul>${links.map(([href, label, icon, logout]) => `
                <li class="${!logout && currentPage === href ? "active" : ""}">
                    <a href="${href}" ${!logout && currentPage === href ? 'aria-current="page"' : ""} ${logout ? 'data-logout' : ""}>
                        <i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span>
                    </a>
                </li>`).join("")}
            </ul>
        </nav>`;
    document.body.classList.add("has-app-sidebar");
    if (currentPage === "dashboard.html") document.body.classList.add("dashboard-page");
})();
