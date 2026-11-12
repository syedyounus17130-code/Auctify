# Deploy AuctFy for a bidding test

The app is configured for a single Render web service. It serves the site and API from the same origin, stores SQLite and uploaded images on a persistent disk, and refreshes active auction prices and bid history every three seconds.

## Deploy

1. Push this repository to GitHub (including the root `render.yaml`). In Render, create a Blueprint and select the repository.
2. The Blueprint creates a paid `starter` web service with a 1 GB persistent disk mounted at `/var/data`. Free web services cannot use persistent disks, and their local SQLite database and uploads are erased on restarts. The starter plan incurs a Render charge.
3. Set the prompted environment values in Render:
   - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: use a matching **test mode** key pair from Razorpay for bidding/subscription checkout tests. Keep the secret private.
   - `ADMIN_USERNAME`: choose a non-default username.
   - `ADMIN_PASSWORD_HASH`: a bcrypt hash of your admin password. From the `server` directory, generate one with `node -e "require('bcrypt').hash('CHANGE_THIS_PASSWORD', 12).then(console.log)"`, replacing the placeholder before running it.
   - `APP_BASE_URL`: the full HTTPS URL Render assigns to the service (for example, `https://auctify.onrender.com`). This is used for password reset links.
4. Deploy and open the Render URL. Sign up two separate test accounts, create an auction with one account, and place a bid from the other while the auction is active. The auction page refreshes its displayed price and bid history automatically.
5. Open **Administrator access** on the home page and sign in with the configured admin credentials to view the dashboard.

Razorpay checkout needs the key ID and secret to be from the same mode. Test mode is appropriate for this deployment; do not use live payment keys for bidding tests. Password reset emails additionally require `RESEND_API_KEY` and `PASSWORD_RESET_FROM_EMAIL` for a verified sender; those are optional for bidding.

The disk-backed SQLite setup is intended for a small, single-instance test. Keep the Render disk attached and do not scale this service to multiple instances. Before inviting real users or accepting real payments, the app needs stronger server-side user authentication and a production database/payment operational review; current bidder identity is supplied by browser-side account data.
