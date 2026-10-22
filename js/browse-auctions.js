// ======================================
// Browse Auctions
// ======================================

const container =
    document.getElementById("auctionContainer");


// ======================================
// Load Auctions
// ======================================

async function loadAuctions() {

    try {

        const response =
            await fetch("/auctions");

        const data =
            await response.json();

        if (!data.success) {

            container.innerHTML =
                "<p>Unable to load auctions.</p>";

            return;

        }


        const requestedStatus = new URLSearchParams(window.location.search).get("status")?.toLowerCase();
        const statusConfig = {
            ended: { value: "ended", title: "Completed Auctions", empty: "No completed auctions found." },
            scheduled: { value: "scheduled", title: "Scheduled Auctions", empty: "No scheduled auctions found." }
        };
        const selectedStatus = statusConfig[requestedStatus];
        const auctions = selectedStatus
            ? data.auctions.filter(auction => String(auction.status).toLowerCase() === selectedStatus.value)
            : data.auctions;

        if (selectedStatus) {
            document.querySelector(".page-header h1").textContent = selectedStatus.title;
        }

        if (auctions.length === 0) {

            container.innerHTML = `
                <p>
                    ${selectedStatus ? selectedStatus.empty : "No auctions available right now."}
                </p>
            `;

            return;

        }


        container.innerHTML = "";


        auctions.forEach(auction => {

            let image = "";

            if (auction.image) {

                const firstImage =
                    auction.image.split(",")[0];

                image =
                    `/uploads/${firstImage}`;

            } else {

                image =
                    "https://via.placeholder.com/500x300?text=No+Image";

            }


            const card = document.createElement("div");

            card.className =
                "auction-card";


            card.innerHTML = `

                <img
                    src="${image}"
                    class="auction-image"
                    alt="${auction.product_name}"
                >

                <div class="auction-content">

                    <h3>
                        ${auction.product_name}
                    </h3>

                    <div class="category">
                        ${auction.category}
                    </div>

                    <div class="price">
                        Starting Price:
                        ₹${auction.starting_price}
                    </div>

                    <div class="status">
                        ${auction.status}
                    </div>

                    <a
                        href="auction-details.html?id=${auction.id}"
                        class="view-button"
                    >
                        View Auction
                    </a>

                </div>

            `;


            container.appendChild(card);

        });

    } catch (error) {

        console.error(
            "Auction Loading Error:",
            error
        );

        container.innerHTML = `
            <p>
                Unable to connect to AuctFy server.
            </p>
        `;

    }

}


loadAuctions();
