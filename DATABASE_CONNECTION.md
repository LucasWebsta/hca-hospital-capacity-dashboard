# Database Connection Setup

## Step 1: Run Database Schema

Run the following SQL files in your Neon database console (console.neon.tech):

1. **First, run the main schema:**
   - File: `db/schema.sql`
   - This creates the hospital census tables

2. **Then, run the users schema:**
   - File: `db/users_schema.sql`
   - This creates the users and activity_logs tables
   - Includes default admin user: `michael.robby@hcahealthcare.com` / `admin123`

## Step 2: Verify Database Connection

The connection string is already configured in `api/local.settings.json`:
```
postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

## Step 3: Start the API Server

```bash
cd innovate26/api
npm install
npm run build
npm run dev:express
```

The API will be available at `http://localhost:7071`

## Step 4: Test the Connection

### Test Login
Open `login.html` and try logging in with:
- Email: `michael.robby@hcahealthcare.com`
- Password: `admin123`

### Test Admin Panel
Open `admin.html` - it should load users and activity logs from the database.

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Users
- `GET /api/users` - Get all users
- `POST /api/users` - Add new user
- `DELETE /api/users/:id` - Delete user

### Activity Logs
- `GET /api/activity` - Get activity logs
- `GET /api/activity?action=signin` - Filter by action
- `GET /api/activity?limit=50` - Limit results

## Default Users

After running `users_schema.sql`, these users are available:

1. **Michael Robby** (Administrator)
   - Email: `michael.robby@hcahealthcare.com`
   - Password: `admin123`

2. **Sarah Johnson** (Executive Director)
   - Email: `sarah.johnson@hcahealthcare.com`
   - Password: `password123`

3. **David Chen** (Manager)
   - Email: `david.chen@hcahealthcare.com`
   - Password: `password123`

4. **Emily Williams** (Analyst)
   - Email: `emily.williams@hcahealthcare.com`
   - Password: `password123`

## Troubleshooting

### API not connecting to database
1. Check that `api/local.settings.json` exists and has the correct `DATABASE_URL`
2. Verify the database schema has been run
3. Check API server logs for connection errors

### Login not working
1. Verify the users table has data
2. Check browser console for API errors
3. Ensure API server is running on port 7071

### Admin panel not loading users
1. Check browser console for errors
2. Verify API endpoint `/api/users` is accessible
3. Check that CORS is enabled in the API



