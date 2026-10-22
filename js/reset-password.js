const form = document.getElementById("resetPasswordForm");
const message = document.getElementById("resetMessage");
const button = document.getElementById("resetPasswordButton");
const token = new URLSearchParams(location.search).get("token") || "";
const host = location.hostname;
const local = ["localhost", "127.0.0.1"].includes(host);
const apiBase = location.protocol === "file:" || (local && location.port !== "3000")
    ? `http://${local ? host : "localhost"}:3000` : "";

if (!token) {
    button.disabled = true;
    message.textContent = "Reset link is missing. Request a new link from the login page.";
}
form.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.getElementById("newPassword").value;
    const confirm = document.getElementById("confirmPassword").value;
    if (password !== confirm) { message.textContent = "Passwords do not match."; return; }
    button.disabled = true;
    message.className = "";
    message.textContent = "Updating password...";
    try {
        const response = await fetch(`${apiBase}/reset-password`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Could not update password.");
        message.className = "success";
        message.textContent = data.message;
        form.querySelectorAll("input").forEach(input => input.disabled = true);
        window.setTimeout(() => { location.href = "login.html"; }, 1500);
    } catch (error) {
        message.textContent = error instanceof TypeError
            ? "Cannot reach AuctFy. Start the server with node server/app.js and try again."
            : error.message;
    } finally { button.disabled = false; }
});
