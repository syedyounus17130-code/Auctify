// ======================================
// Get Auction ID
// ======================================

const urlParams = new URLSearchParams(window.location.search);
const auctionId = urlParams.get("id");
const localApiHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const apiBase = location.protocol === "file:" || (localApiHost && location.port !== "3000")
    ? `http://${localApiHost ? location.hostname : "localhost"}:3000` : "";
const apiUrl = path => `${apiBase}${path}`;


// ======================================
// Logged-in User
// ======================================

const user = JSON.parse(localStorage.getItem("user"));


// ======================================
// Elements
// ======================================

const loading = document.getElementById("loading");
const auctionDetails = document.getElementById("auctionDetails");

const currentBidElement =
    document.getElementById("currentBid");

const minimumBidText =
    document.getElementById("minimumBidText");

const bidAmountInput =
    document.getElementById("bidAmount");

const bidButton =
    document.getElementById("bidButton");

const bidMessage =
    document.getElementById("bidMessage");


// ======================================
// Auction Variable
// ======================================

let auction = null;


// ======================================
// Check Auction ID
// ======================================

if (!auctionId) {

    loading.textContent =
        "Auction ID not found.";

} else {

    loadAuction();

}


// ======================================
// Load Auction
// ======================================

async function loadAuction() {

    try {

        const response =
            await fetch(apiUrl(`/auction/${encodeURIComponent(auctionId)}`));

        const data =
            await response.json();


        if (!data.success) {

            loading.textContent =
                data.message || "Auction not found.";

            return;

        }


        auction = data.auction;


        // ======================================
        // Product Image
        // ======================================

        if (auction.image) {

            const firstImage =
                auction.image.split(",")[0];

            document.getElementById("auctionImage").src =
                `/uploads/${firstImage}`;

        } else {

            document.getElementById("auctionImage").src =
                "https://via.placeholder.com/600x400?text=No+Image";

        }


        // ======================================
        // Product Details
        // ======================================

        document.getElementById("productName").textContent =
            auction.product_name;

        document.getElementById("category").textContent =
            auction.category || "No category";

        document.getElementById("description").textContent =
            auction.description || "No description available.";


        // ======================================
        // Pricing
        // ======================================

        document.getElementById("startingPrice").textContent =
            `₹${auction.starting_price}`;

        document.getElementById("minIncrement").textContent =
            `₹${auction.min_increment}`;


        // ======================================
        // Dates
        // ======================================

        document.getElementById("startDate").textContent =
            `${auction.start_date} ${auction.start_time}`;

        document.getElementById("endDate").textContent =
            `${auction.end_date} ${auction.end_time}`;


        // ======================================
        // Status
        // ======================================

        document.getElementById("auctionStatus").textContent =
            auction.status;


        // ======================================
        // Seller
        // ======================================

        document.getElementById("sellerName").textContent =
            auction.seller_name || "AuctFy Seller";


        // ======================================
        // Load Highest Bid
        // ======================================

        await loadHighestBid();


        // ======================================
        // Show Page
        // ======================================

        loading.style.display = "none";

        auctionDetails.classList.remove("hidden");


    } catch (error) {

        console.error(
            "Auction Details Error:",
            error
        );

        loading.textContent =
            "Unable to connect to AuctFy server.";

    }

}


function updateBidButton() {
    const active = Boolean(auction && auction.status === "Active");
    const isSeller = Boolean(user && auction && Number(user.id) === Number(auction.user_id));
    bidButton.disabled = !active || isSeller;
    bidButton.title = !active ? "Bidding is available while the auction is live." : isSeller ? "Sellers cannot bid on their own auction." : "Place a bid";
}

async function loadHighestBid() {
    try {
        const response = await fetch(apiUrl(`/auction/${encodeURIComponent(auctionId)}/highest-bid`));
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to load current bid.");
        const highestBid = Number(data.highest_bid) || 0;
        currentBidElement.textContent = `INR ${highestBid.toLocaleString("en-IN")}`;
        const minimumBid = highestBid === 0
            ? Number(auction.starting_price)
            : highestBid + Number(auction.min_increment);
        minimumBidText.textContent = `Minimum bid: INR ${minimumBid.toLocaleString("en-IN")}`;
        bidAmountInput.min = String(minimumBid);
        updateBidButton();
    } catch (error) {
        console.error("Highest Bid Error:", error);
        bidMessage.textContent = error.message || "Could not load the current bid.";
        bidMessage.style.color = "red";
        updateBidButton();
    }
}

// ======================================
// Place Bid
// ======================================

bidButton.addEventListener(
    "click",
    async function () {

        // ======================================
        // Login Check
        // ======================================

        if (!auction) {
            bidMessage.textContent = "Auction is still loading. Try again in a moment.";
            return;
        }

        if (!user) {

            alert(
                "Please login before placing a bid."
            );

            window.location.href =
                "login.html";

            return;

        }


        // ======================================
        // Seller Check
        // ======================================

        if (
            Number(user.id) ===
            Number(auction.user_id)
        ) {

            alert(
                "You cannot bid on your own auction."
            );

            return;

        }


        // ======================================
        // Bid Amount
        // ======================================

        const bidAmount =
            Number(bidAmountInput.value);


        if (!bidAmount || bidAmount <= 0) {

            bidMessage.textContent =
                "Please enter a valid bid amount.";

            return;

        }


        // ======================================
        // Send Bid
        // ======================================

        try {

            bidButton.disabled = true;

            bidButton.textContent =
                "Placing Bid...";


            const response =
                await fetch(
                    apiUrl("/place-bid"),
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({

                            auction_id:
                                auctionId,

                            user_id:
                                user.id,

                            bid_amount:
                                bidAmount

                        })
                    }
                );


            const data =
                await response.json();


            if (data.success) {

                bidMessage.textContent = "Bid result: " + data.message;

                bidMessage.style.color =
                    "green";


                bidAmountInput.value = "";


                // Reload highest bid

                await loadHighestBid();
                await loadBidHistory();
                await loadWinner();


            } else {

                bidMessage.textContent = "Bid result: " + data.message;

                bidMessage.style.color =
                    "red";

            }


        } catch (error) {

            console.error(
                "Place Bid Error:",
                error
            );

            bidMessage.textContent =
                "Unable to connect to AuctFy server.";

            bidMessage.style.color =
                "red";

        }


        // ======================================
        // Restore Button
        // ======================================

        bidButton.innerHTML = '<i class="fa-solid fa-gavel"></i> Place Bid';
        updateBidButton();

    }
);
// ======================================
// Load Bid History
// ======================================

async function loadBidHistory() {

    try {

        const response = await fetch(
            apiUrl(`/auction/${encodeURIComponent(auctionId)}/bids`)
        );

        const data = await response.json();

        const bidHistory =
            document.getElementById("bidHistory");


        if (!data.success) {

            bidHistory.innerHTML =
                "<p>Unable to load bid history.</p>";

            return;

        }


        if (!data.bids || data.bids.length === 0) {

            bidHistory.innerHTML =
                '<p class="no-bids">No bids yet.</p>';

            return;

        }


        bidHistory.innerHTML = "";


        data.bids.forEach((bid) => {

            const bidItem =
                document.createElement("div");

            bidItem.className = "bid-item";


            bidItem.innerHTML = `

                <div>

                    <div class="bidder-name">
                        ${escapeHtml(bid.bidder_name)}
                    </div>

                    <div class="bid-time">
                        ${formatBidTime(bid.created_at)}
                    </div>

                </div>

                <div class="bid-amount">
                    ₹${Number(bid.bid_amount).toLocaleString("en-IN")}
                </div>

            `;


            bidHistory.appendChild(bidItem);

        });


    } catch (error) {

        console.error(
            "Bid History Error:",
            error
        );

        document.getElementById("bidHistory").innerHTML =
            "<p>Unable to load bid history.</p>";

    }

}


// ======================================
// Format Bid Time
// ======================================

function formatBidTime(dateString) {

    if (!dateString) {
        return "";
    }

    const date = new Date(
        dateString.replace(" ", "T") + "Z"
    );

    return date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
    });

}


// ======================================
// Prevent HTML Injection
// ======================================

function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent =
        text || "";

    return div.innerHTML;

}
// ======================================
// Load Auction Winner
// ======================================

async function loadWinner() {

    // Only show winner when auction has ended

    if (!auction || auction.status !== "Ended") {
        return;
    }

    try {

        const response = await fetch(
            apiUrl(`/auction/${encodeURIComponent(auctionId)}/winner`)
        );

        const data = await response.json();

        if (!data.success) {
            return;
        }

        const winnerBox =
            document.getElementById("winnerBox");

        const winnerName =
            document.getElementById("winnerName");

        const winningBid =
            document.getElementById("winningBid");


        // No bids = no winner

        if (!data.winner) {

            winnerBox.style.display = "block";

            winnerName.textContent =
                "No bids were placed.";

            winningBid.textContent =
                "No winning bid.";

            return;
        }


        // Show winner

        winnerBox.style.display = "block";

        winnerName.textContent =
            data.winner.winner_name;

        winningBid.textContent =
            `₹${Number(
                data.winner.bid_amount
            ).toLocaleString("en-IN")}`;


    } catch (error) {

        console.error(
            "Winner Error:",
            error
        );

    }

}



