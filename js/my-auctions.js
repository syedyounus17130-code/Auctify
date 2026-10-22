// Check login
const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
    alert("Please login first.");
    window.location.href = "login.html";
}


// Get auction container
const auctionContainer =
    document.getElementById("auctionContainer");


// Load auctions
async function loadMyAuctions() {

    try {

        const response = await fetch(
            `/my-auctions/${user.id}`
        );

        const data = await response.json();

        console.log("My Auctions:", data);


        if (!data.success) {

            auctionContainer.innerHTML = `
                <div class="empty">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <h3>Unable to load auctions</h3>
                    <p>${data.message}</p>
                </div>
            `;

            return;
        }


        if (data.auctions.length === 0) {

            auctionContainer.innerHTML = `
                <div class="empty">

                    <i class="fa-solid fa-gavel"></i>

                    <h3>No Auctions Yet</h3>

                    <p>
                        You haven't created any auctions yet.
                    </p>

                    <br>

                    <a href="create-auction.html"
                       class="create-btn">
                        Create Your First Auction
                    </a>

                </div>
            `;

            return;
        }


        auctionContainer.innerHTML = "";


        data.auctions.forEach(auction => {

            let imageHTML = "";

            if (auction.image) {

                const firstImage =
                    auction.image.split(",")[0];

                imageHTML = `
                    <img
                        src="/uploads/${firstImage}"
                        class="auction-image"
                        alt="${auction.product_name}">
                `;

            } else {

                imageHTML = `
                    <div
                        class="auction-image"
                        style="
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            font-size:50px;
                            color:#ccc;
                        "
                    >
                        <i class="fa-solid fa-image"></i>
                    </div>
                `;

            }


            const card = document.createElement("div");

            card.className = "auction-card";

            card.innerHTML = `

                ${imageHTML}

                <div class="auction-details">

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

                    <div class="increment">
                        Minimum Increment:
                        ₹${auction.min_increment}
                    </div>

                    <div class="date">
                        <strong>Starts:</strong>
                        ${auction.start_date}
                        ${auction.start_time}
                    </div>

                    <div class="date">
                        <strong>Ends:</strong>
                        ${auction.end_date}
                        ${auction.end_time}
                    </div>

                    <span class="status">
                        ${auction.status}
                    </span>

                    <div class="auction-actions">

                        <button
                            class="edit-btn"
                            onclick="editAuction(${auction.id})">
                            <i class="fa-solid fa-pen"></i>
                            Edit
                        </button>

                        <button
                            class="delete-btn"
                            onclick="deleteAuction(${auction.id})">
                            <i class="fa-solid fa-trash"></i>
                            Delete
                        </button>

                    </div>

                </div>
            `;


            auctionContainer.appendChild(card);

        });

    } catch (error) {

        console.error(error);

        auctionContainer.innerHTML = `
            <div class="empty">

                <i class="fa-solid fa-server"></i>

                <h3>Server Connection Error</h3>

                <p>
                    Unable to connect to AuctFy server.
                </p>

            </div>
        `;

    }

}


// =============================
// DELETE AUCTION
// =============================

async function deleteAuction(auctionId) {

    const confirmDelete = confirm(
        "Are you sure you want to delete this auction?"
    );

    if (!confirmDelete) {
        return;
    }


    try {

        const response = await fetch(
            `/delete-auction/${auctionId}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    user_id: user.id
                })
            }
        );


        const data = await response.json();


        if (data.success) {

            alert("Auction deleted successfully.");

            loadMyAuctions();

        } else {

            alert(data.message);

        }

    } catch (error) {

        console.error(error);

        alert("Unable to delete auction.");

    }

}


// =============================
// EDIT AUCTION
// =============================

async function editAuction(auctionId) {

    const newProductName = prompt(
        "Enter new product name:"
    );

    if (newProductName === null) {
        return;
    }


    const newStartingPrice = prompt(
        "Enter new starting price:"
    );

    if (newStartingPrice === null) {
        return;
    }


    const newIncrement = prompt(
        "Enter new minimum increment:"
    );

    if (newIncrement === null) {
        return;
    }


    if (
        newProductName.trim() === "" ||
        newStartingPrice.trim() === "" ||
        newIncrement.trim() === ""
    ) {

        alert("Please enter valid details.");

        return;

    }


    try {

        const response = await fetch(
            `/update-auction/${auctionId}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    user_id: user.id,

                    product_name:
                        newProductName.trim(),

                    starting_price:
                        Number(newStartingPrice),

                    min_increment:
                        Number(newIncrement)

                })
            }
        );


        const data = await response.json();


        if (data.success) {

            alert("Auction updated successfully.");

            loadMyAuctions();

        } else {

            alert(data.message);

        }

    } catch (error) {

        console.error(error);

        alert("Unable to update auction.");

    }

}


// Load
loadMyAuctions();
