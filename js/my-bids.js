// ======================================
// Check Login
// ======================================

const user =
    JSON.parse(localStorage.getItem("user"));

if (!user) {

    alert("Please login first.");

    window.location.href =
        "login.html";

}


// ======================================
// Elements
// ======================================

const loading =
    document.getElementById("loading");

const bidsContainer =
    document.getElementById("bidsContainer");

const noBids =
    document.getElementById("noBids");


// ======================================
// Load My Bids
// ======================================

loadMyBids();


async function loadMyBids() {

    try {

        const response =
            await fetch(
                `/my-bids/${user.id}`
            );

        const data =
            await response.json();


        loading.style.display =
            "none";


        if (!data.success) {

            alert(data.message);

            return;

        }


        if (
            !data.bids ||
            data.bids.length === 0
        ) {

            noBids.style.display =
                "block";

            return;

        }


        bidsContainer.innerHTML = "";


        data.bids.forEach(bid => {

            const card =
                document.createElement("div");

            card.className =
                "bid-card";


            const image =
                bid.image
                    ? `/uploads/${bid.image.split(",")[0]}`
                    : "https://via.placeholder.com/300x200?text=No+Image";


            card.innerHTML = `

                <img
                    src="${image}"
                    alt="${escapeHtml(
                        bid.product_name
                    )}"
                >

                <div class="bid-info">

                    <h2>
                        ${escapeHtml(
                            bid.product_name
                        )}
                    </h2>

                    <p>
                        Seller:
                        ${escapeHtml(
                            bid.seller_name
                        )}
                    </p>

                    <p>
                        Your Bid:
                        <strong>
                            ₹${Number(
                                bid.bid_amount
                            ).toLocaleString("en-IN")}
                        </strong>
                    </p>

                    <p>
                        Auction Status:
                        <strong>
                            ${escapeHtml(
                                bid.status
                            )}
                        </strong>
                    </p>

                    <p>
                        Auction Ends:
                        ${bid.end_date}
                        ${bid.end_time}
                    </p>

                    <button
                        onclick="viewAuction(${bid.auction_id})"
                    >
                        View Auction
                    </button>

                </div>

            `;


            bidsContainer.appendChild(card);

        });


    } catch (error) {

        console.error(
            "My Bids Error:",
            error
        );

        loading.textContent =
            "Unable to connect to AuctFy server.";

    }

}


// ======================================
// View Auction
// ======================================

function viewAuction(auctionId) {

    window.location.href =
        `auction-details.html?id=${auctionId}`;

}


// ======================================
// Security Helper
// ======================================

function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent =
        text || "";

    return div.innerHTML;

}