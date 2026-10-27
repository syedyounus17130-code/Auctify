const form = document.getElementById("signupForm");
const submitButton = document.getElementById("signupSubmit");
const statusMessage = document.getElementById("signupStatus");
const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const apiBase = location.protocol === "file:" || (localHost && location.port !== "3000")
    ? `http://${localHost ? location.hostname : "localhost"}:3000` : "";

function showStatus(message, type = "") {
    statusMessage.textContent = message;
    statusMessage.className = `signup-status ${type}`.trim();
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitButton.disabled) return;

    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    if (password !== confirmPassword) {
        showStatus("Passwords do not match.", "error");
        return;
    }

    submitButton.disabled = true;
    showStatus("Creating your account…");
    try {
        const response = await fetch(`${apiBase}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: document.getElementById("name").value.trim(),
                email: document.getElementById("email").value.trim().toLowerCase(),
                phone: document.getElementById("phone").value.trim(),
                password,
                terms_accepted: document.getElementById("termsAccepted").checked
            })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Could not create your account.");

        showStatus(result.message || "Account created successfully! Redirecting to login…", "success");
        window.setTimeout(() => window.location.assign("login.html"), 900);
    } catch (error) {
        showStatus(error instanceof TypeError
            ? "Cannot reach AuctFy. Start the server with node server/app.js and try again."
            : error.message || "Could not create your account.", "error");
    } finally {
        submitButton.disabled = false;
    }
});
