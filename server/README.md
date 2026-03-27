# SLCRICKPRO - Node.js Backend with MongoDB Atlas

This backend server is designed to sync cricket data from the SLCRICKPRO app. It uses Express.js and connects to a MongoDB Atlas cluster.

## Prerequisites
1. Node.js installed
2. A free MongoDB Atlas cluster created at [mongodb.com](https://mongodb.com)

## Setup Instructions

1. **Get your MongoDB Connection String**
   - Go to [MongoDB Atlas console](https://cloud.mongodb.com)
   - Create a cluster / Database
   - Get the connection string (it looks like `mongodb+srv://user:password@cluster.mongodb.net/dbname`)

2. **Configure Environment Variables**
   - In this `server` folder, create a `.env` file (see `.env.example`)
   - Paste your connection string into `MONGO_URI`:
     ```env
     MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/slcrickpro?retryWrites=true&w=majority
     PORT=3000
     ```

3. **Start the Server**
   - Open a terminal in this `server` directory.
   - Run: `npm install`
   - Run: `npm start`
   - The server will connect to MongoDB and start the REST API.

4. **Connect the App to the Backend**
   - The app defaults to `http://localhost:3000`.
   - If your backend is deployed elsewhere, set it in the app console:
     ```javascript
     localStorage.setItem('cricpro_backend_url', 'https://your-backend-url.com')
     ```

## API Endpoints
- `POST /players` - Register/Update player
- `GET /players` - List all players
- `POST /teams` - Register/Update team
- `GET /teams` - List all teams
- `POST /stats/update` - Update career stats for one player
- `POST /stats/bulk-update` - Bulk update stats after tournament
- `GET /stats/players` - Get all players with career stats (for rankings)
- `POST /team-stats/update` - Update team career stats
- `GET /team-stats` - Get team career stats (for rankings)
- `POST /sync/products` - Register/Update a product
- `GET /sync/products` - List all products
- `DELETE /sync/products/:id` - Delete a product
- `POST /sync/match` - Sync live match data
- `POST /sync/tournament` - Sync tournament structure
- `POST /api/tournaments/:id/verify-password` - Verify tournament scoring password and issue scoped token
- `POST /api/tournaments/:id/scoring-authorized` - Validate tournament scoring token
- `GET /tv/matches/:id/light` - Lightweight cached TV payload (<2KB target)
- `GET /health` - Check database connection status

## Optional Environment Variables
- `SCORING_TOKEN_SECRET` - HMAC secret for tournament scoring access tokens.
- `REDIS_URL` - Redis connection URL for TV payload caching (falls back to memory cache if not set).

Your app will now seamlessly sync players, teams, and stats into your MongoDB Atlas database!
