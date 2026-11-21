# ChatSpace

A small private chat app: visitors register once to chat only with the admin, and the admin gets a real-time inbox for every visitor.

## Stack

- React, Vite, Tailwind CSS
- Express, MongoDB/Mongoose, Socket.IO
- JWT sessions for visitors and the admin

## Run locally

1. Install Node.js 20+ and MongoDB, or create a free MongoDB Atlas cluster.
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI`, a long random `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `CLIENT_URL=http://localhost:5173`.
3. Copy `client/.env.example` to `.env` in the project root. The defaults connect the frontend to the local API.
4. From the project root:

   ```sh
   npm install
   npm run dev
   ```

5. Open `http://localhost:5173`. Visitors register there. Admins sign in at `http://localhost:5173/admin/login`.

The API listens on port 4000 by default. `npm run build` makes the production frontend in `dist`; `npm start` starts the API. The frontend is deployed separately from the API.

## MongoDB Atlas

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas/database) and create a database user with a strong password.
2. In **Network Access**, allow your development IP address while developing. For a hosted backend, allow its outbound IP addresses if known; `0.0.0.0/0` is convenient but less restrictive, so use it only with a strong database password and least-privilege database user.
3. In **Connect → Drivers**, copy the Node.js connection string. Replace the password placeholder and append `/chatspace` before any query string, then set it as `MONGODB_URI`.
4. Mongoose creates the `users`, `conversations`, and `messages` collections and indexes automatically.

## Deploy

### Backend on Render

1. Create a Render **Web Service** for this repository.
2. Set the build command to `npm install` and the start command to `npm start`.
3. Add `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `CLIENT_URL` as Render environment variables. `CLIENT_URL` must be your Vercel site origin (no trailing slash). Multiple origins can be comma-separated.
4. Render sets `PORT` automatically. The server binds to it and enables CORS and Socket.IO for the configured client origin.
5. Confirm `https://YOUR-API.onrender.com/api/health` returns `{"ok":true}`.

### Frontend on Vercel

1. Import the repository as a Vercel project. Keep the project root as the repository root; the default Vite build command is `npm run build`, with output directory `dist`.
2. Set `VITE_API_URL` and `VITE_SOCKET_URL` to the Render API origin, both without a trailing slash.
3. After the first Vercel deployment, add its site origin to Render's `CLIENT_URL` and redeploy the backend.
4. The repository includes a Vercel rewrite so direct navigation to `/admin` and `/admin/login` serves the SPA.
5. Redeploy after setting environment variables. Confirm the public page, `/admin/login`, visitor messaging, and admin messaging.

## Privacy and security

- The backend creates an unguessable signed token on visitor registration and checks it against MongoDB on later visits. The browser stores that token locally; a phone number alone does not grant account access.
- Visitors can only fetch and send messages using the conversation looked up from their authenticated user ID. Submitted conversation IDs are never used for visitor access.
- Socket.IO authenticates the same token; visitors are added only to their own conversation room. Admin routes require an admin token.
- Admin credentials are read only from backend environment variables. Use a unique, strong password and a long random JWT secret; do not put backend secrets in Vercel or commit `.env` files.
- Auth and messaging endpoints have basic rate limits. Use HTTPS in production.

## Notes

- Visitor and admin sessions expire after 30 days. Signing out clears the local session.
- The admin contact shown to visitors is `8448848514` / `sjha44812@gmail.com`.
- No email or phone verification is performed: this is a lightweight personal chat, not proof of identity.
