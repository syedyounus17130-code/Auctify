const form = document.getElementById("loginForm");
const isLocalHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const apiBase = location.protocol === "file:" || (isLocalHost && location.port !== "3000")
    ? `http://${isLocalHost ? location.hostname : "localhost"}:3000` : "";

form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
        const response = await fetch(`${apiBase}/login`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok || !data.success) { alert(data.message || "Login failed."); return; }
        localStorage.setItem("user", JSON.stringify(data.user));
        location.href = "/dashboard.html";
    } catch (error) {
        console.error("Login error:", error);
        alert("Could not connect to AuctFy. Start the server with node server/app.js.");
    } finally { submitButton.disabled = false; }
});
