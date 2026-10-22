const user = JSON.parse(localStorage.getItem("user") || "null");
if (!user) {
    alert("Please login first.");
    window.location.href = "login.html";
} else {
    const checkoutButton = document.getElementById("subscribeBtn");
    const qrButton = document.getElementById("upiQrButton");
    const qrPanel = document.getElementById("upiQrPanel");
    const qrImage = document.getElementById("upiQrImage");
    const qrStatus = document.getElementById("upiQrStatus");
    const statusBox = document.getElementById("subscriptionStatus");
    const consent = document.getElementById("termsAccepted");
    const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const apiBase = window.location.protocol === "file:" || (isLocal && window.location.port !== "3000")
        ? `http://${isLocal ? window.location.hostname : "localhost"}:3000` : "";
    let activeSubscription = false;
    let processing = false;
    let qrPending = false;
    let qrTimer = null;
    let qrExpiresAt = 0;

    const apiUrl = path => `${apiBase}${path}`;
    function setStatus(message, kind = "") {
        statusBox.textContent = message;
        statusBox.className = `subscription-status ${kind}`;
    }
    function updateButtons() {
        const disabled = processing || activeSubscription || !consent.checked || qrPending;
        checkoutButton.disabled = disabled;
        qrButton.disabled = disabled;
        checkoutButton.textContent = activeSubscription ? "Subscription Active" : processing ? "Processing..." : consent.checked ? "Subscribe Now" : "Agree to terms to continue";
        qrButton.innerHTML = '<i class="fa-solid fa-qrcode"></i> ' + (qrPending ? "UPI QR payment in progress" : "Pay by UPI QR (any UPI app)");
    }
    async function readJson(response) {
        const text = await response.text();
        try { return JSON.parse(text); }
        catch { throw new Error(`Server returned an unexpected response (${response.status}). Start the AuctFy server and open the app through it.`); }
    }
    async function checkSubscription() {
        setStatus("Checking subscription...");
        try {
            const response = await fetch(apiUrl(`/subscription/${encodeURIComponent(user.id)}`));
            const data = await readJson(response);
            if (!response.ok || !data.success) throw new Error(data.message || "Unable to check subscription.");
            activeSubscription = Boolean(data.subscription);
            setStatus(data.subscription
                ? `Active subscription: ${data.subscription.plan}. Valid until ${data.subscription.end_date}.`
                : "No active subscription. Your first auction is free.", data.subscription ? "status-success" : "");
        } catch (error) {
            setStatus(error.message || "Cannot reach AuctFy. Start the server with node server/app.js.", "status-error");
        }
        updateButtons();
    }
    async function pollQrPayment(qrId) {
        if (!qrPending) return;
        if (Date.now() >= qrExpiresAt) {
            clearInterval(qrTimer); qrTimer = null; qrPending = false;
            qrStatus.textContent = "This QR has expired. Create a new one to try again.";
            updateButtons(); return;
        }
        try {
            const response = await fetch(apiUrl("/subscription-qr-status"), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: user.id, qr_id: qrId })
            });
            const data = await readJson(response);
            if (!response.ok || !data.success) throw new Error(data.message || "Unable to check UPI payment.");
            if (data.paid) {
                clearInterval(qrTimer); qrTimer = null; qrPending = false; activeSubscription = true;
                qrStatus.textContent = data.message || "UPI payment confirmed.";
                setStatus(data.message || "UPI payment confirmed and subscription activated.", "status-success");
                updateButtons();
                await checkSubscription();
            } else {
                qrStatus.textContent = "Waiting for UPI payment. After approving in your UPI app, this page will update automatically.";
            }
        } catch (error) {
            qrStatus.textContent = error.message || "Could not check payment status. Retrying...";
        }
    }
    consent.addEventListener("change", updateButtons);

    checkoutButton.addEventListener("click", async () => {
        if (!consent.checked) { setStatus("Please agree to the Terms and Conditions before continuing.", "status-error"); return; }
        processing = true; updateButtons(); setStatus("Connecting to Razorpay...");
        try {
            const response = await fetch(apiUrl("/create-subscription-order"), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: user.id, terms_accepted: true })
            });
            const order = await readJson(response);
            if (!response.ok || !order.success) throw new Error(order.message || `Could not create a Razorpay order (${response.status}).`);
            if (typeof window.Razorpay !== "function") throw new Error("Razorpay Checkout did not load. Check your internet connection, then refresh.");
            const checkout = new window.Razorpay({
                key: order.key_id, amount: order.amount, currency: order.currency,
                name: "AuctFy", description: "Monthly Seller subscription (30 days)",
                order_id: order.order_id, prefill: { name: user.name || "", email: user.email || "" },
                theme: { color: "#ff9800" },
                handler: async payment => {
                    setStatus("Payment received. Verifying with AuctFy...");
                    try {
                        const verifyResponse = await fetch(apiUrl("/verify-subscription-payment"), {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ user_id: user.id, razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature })
                        });
                        const result = await readJson(verifyResponse);
                        if (!verifyResponse.ok || !result.success) throw new Error(result.message || `Payment verification failed (${verifyResponse.status}).`);
                        processing = false; activeSubscription = true;
                        setStatus(result.message || "Payment successful and subscription activated.", "status-success");
                        await checkSubscription();
                    } catch (error) {
                        processing = false;
                        setStatus(`${error.message || "Payment verification failed."} Keep your Razorpay payment ID for support: ${payment.razorpay_payment_id}`, "status-error");
                        updateButtons();
                    }
                },
                modal: { ondismiss: () => { processing = false; setStatus("Checkout closed. No payment was confirmed."); updateButtons(); } }
            });
            checkout.on("payment.failed", event => {
                processing = false; setStatus(event.error?.description || "Razorpay could not complete the payment.", "status-error"); updateButtons();
            });
            checkout.open();
        } catch (error) {
            processing = false;
            setStatus(error instanceof TypeError ? "Cannot reach AuctFy. Start node server/app.js; local API requests use port 3000." : error.message || "Unable to start payment.", "status-error");
            updateButtons();
        }
    });

    qrButton.addEventListener("click", async () => {
        if (!consent.checked) { setStatus("Please agree to the Terms and Conditions before continuing.", "status-error"); return; }
        processing = true; updateButtons(); setStatus("Creating a one-time UPI QR...");
        qrStatus.textContent = ""; qrImage.removeAttribute("src"); qrPanel.hidden = true;
        try {
            const response = await fetch(apiUrl("/create-subscription-qr"), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: user.id, terms_accepted: true })
            });
            const data = await readJson(response);
            if (!response.ok || !data.success) throw new Error(data.message || `Could not create QR (${response.status}).`);
            qrImage.src = data.image_url;
            qrPanel.hidden = false;
            qrExpiresAt = Number(data.close_by) * 1000 || Date.now() + 20 * 60 * 1000;
            qrPending = true; processing = false;
            qrStatus.textContent = `Scan INR 499 with any UPI app. This one-time QR expires at ${new Date(qrExpiresAt).toLocaleTimeString()}.`;
            setStatus("UPI QR is ready. Scan it with any UPI app; confirmation will appear here.");
            updateButtons();
            qrTimer = window.setInterval(() => pollQrPayment(data.qr_id), 12000);
            pollQrPayment(data.qr_id);
        } catch (error) {
            processing = false;
            setStatus(error instanceof TypeError ? "Cannot reach AuctFy. Start node server/app.js and try again." : error.message || "Unable to create UPI QR.", "status-error");
            updateButtons();
        }
    });

    updateButtons();
    checkSubscription();
}
