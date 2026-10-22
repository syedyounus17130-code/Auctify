const form = document.getElementById("forgotPasswordForm");
const message = document.getElementById("resetMessage");
const button = document.getElementById("sendResetButton");
const host = location.hostname;
const local = ["localhost", "127.0.0.1"].includes(host);
const apiBase = location.protocol === "file:" || (local && location.port !== "3000")
    ? `http://${local ? host : "localhost"}:3000` : "";

form.addEventListener("submit", async event => {
    event.preventDefault();
    message.className = "";
    message.textContent = "Requesting reset link...";
    button.disabled = true;
    try {
        const response = await fetch(`${apiBase}/forgot-password`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: document.getElementById("resetEmail").value.trim() })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Could not send reset email.");
        message.className = "success";
        message.textContent = data.message;
    } catch (error) {
        message.textContent = error instanceof TypeError
            ? "Cannot reach AuctFy. Start the server with node server/app.js and try again."
            : error.message;
    } finally { button.disabled = false; }
});
