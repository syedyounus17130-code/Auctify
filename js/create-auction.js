// ======================================
// Check if user is logged in
// ======================================

const user = JSON.parse(localStorage.getItem("user"));

if (!user) {

    alert("Please login first.");

    window.location.href = "login.html";

}


// ======================================
// Check Auction Eligibility
// ======================================

async function checkAuctionEligibility() {

    try {

        const response = await fetch(
            `/auction-eligibility/${user.id}`
        );

        const data = await response.json();

        console.log("Auction eligibility:", data);


        if (!data.success) {

            alert(data.message);

            return false;

        }


        // User is not allowed to create another auction

        if (!data.allowed) {

            alert(
                "Your free auction has already been used. " +
                "Please subscribe to create another auction."
            );

            window.location.href = "subscription.html";

            return false;

        }


        // User is allowed

        return true;


    } catch (error) {

        console.error("Eligibility Error:", error);

        alert("Unable to connect to AuctFy server.");

        return false;

    }

}


// ======================================
// Create Auction Form
// ======================================

const form = document.getElementById("auctionForm");


form.addEventListener("submit", async function (e) {

    e.preventDefault();


    // Check if user is allowed to create auction

    const allowed = await checkAuctionEligibility();


    if (!allowed) {

        return;

    }


    // ==================================
    // Create FormData
    // ==================================

    const formData = new FormData();


    // User ID

    formData.append("user_id", user.id);


    // Product Details

    formData.append(
        "product_name",
        document.getElementById("productName").value
    );

    formData.append(
        "category",
        document.getElementById("category").value
    );

    formData.append(
        "description",
        document.getElementById("description").value
    );


    // Pricing

    formData.append(
        "starting_price",
        document.getElementById("startingPrice").value
    );

    formData.append(
        "min_increment",
        document.getElementById("increment").value
    );


    // Dates

    formData.append(
        "start_date",
        document.getElementById("startDate").value
    );

    formData.append(
        "start_time",
        document.getElementById("startTime").value
    );

    formData.append(
        "end_date",
        document.getElementById("endDate").value
    );

    formData.append(
        "end_time",
        document.getElementById("endTime").value
    );


    // ==================================
    // Images
    // ==================================

    const files = document.getElementById("images").files;


    for (let i = 0; i < files.length; i++) {

        formData.append(
            "images",
            files[i]
        );

    }


    // ==================================
    // Send to Server
    // ==================================

    try {

        const response = await fetch(
            "/create-auction",
            {
                method: "POST",
                body: formData
            }
        );


        const data = await response.json();


        if (data.success) {

            alert(data.message);

            form.reset();

        } else {

            alert(data.message);

        }


    } catch (err) {

        console.error("Create Auction Error:", err);

        alert("Server Error");

    }

});