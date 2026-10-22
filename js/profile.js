// ======================================
// Check Login
// ======================================

const user = JSON.parse(localStorage.getItem("user"));

if (!user) {

    alert("Please login first.");

    window.location.href = "login.html";

}


// ======================================
// Display User Information
// ======================================

document.getElementById("profileName").textContent =
    user.name || "User";

document.getElementById("fullName").textContent =
    user.name || "Not available";

document.getElementById("email").textContent =
    user.email || "Not available";


// ======================================
// Get User Details From Database
// ======================================

async function loadProfile() {

    try {

        const response = await fetch(
            `/profile/${user.id}`
        );

        const data = await response.json();

        if (data.success) {

            document.getElementById("fullName").textContent =
                data.user.full_name;

            document.getElementById("email").textContent =
                data.user.email;

            document.getElementById("phone").textContent =
                data.user.phone;

        }

    } catch (error) {

        console.error("Profile Error:", error);

        document.getElementById("phone").textContent =
            "Unable to load";

    }

}


// ======================================
// Load Auction Count
// ======================================

async function loadAuctionCount() {

    try {

        const response = await fetch(
            `/my-auctions/${user.id}`
        );

        const data = await response.json();

        if (data.success) {

            document.getElementById("auctionCount")
                .textContent = data.auctions.length;

        }

    } catch (error) {

        console.error("Auction Count Error:", error);

    }

}


// ======================================
// Load Subscription
// ======================================

async function loadSubscription() {

    try {

        const response = await fetch(
            `/subscription/${user.id}`
        );

        const data = await response.json();

        if (data.subscription) {

            document.getElementById(
                "subscriptionStatus"
            ).textContent = "Active";

        } else {

            document.getElementById(
                "subscriptionStatus"
            ).textContent = "Free";

        }

    } catch (error) {

        console.error(
            "Subscription Error:",
            error
        );

    }

}


// ======================================
// Load Everything
// ======================================

loadProfile();

loadAuctionCount();

loadSubscription();
