# HTML Files Setup

## Running the HTML Files

The HTML files (`login.html` and `admin.html`) can be opened in two ways:

### Option 1: Direct File Opening (Requires API Running)
1. **Start the API server first:**
   ```bash
   cd innovate26/api
   npm run build
   npm run dev:express
   ```
   The API must be running on `http://localhost:7071`

2. **Open the HTML files directly:**
   - Double-click `login.html` or `admin.html`
   - Or right-click → Open with → Browser

   The files will automatically connect to `http://localhost:7071/api`

### Option 2: Using a Local Web Server (Recommended)
1. **Start the API server:**
   ```bash
   cd innovate26/api
   npm run build
   npm run dev:express
   ```

2. **Start the frontend dev server:**
   ```bash
   cd innovate26
   npm run dev
   ```
   This starts Vite on `http://localhost:5173` (or similar)

3. **Access the files:**
   - Login: `http://localhost:5173/login.html`
   - Admin: `http://localhost:5173/admin.html`

## API Connection

The HTML files automatically detect if they're being opened from:
- **File system** (`file://`): Uses `http://localhost:7071/api`
- **Web server** (`http://` or `https://`): Uses relative `/api` paths (proxied by Vite)

## Troubleshooting

### CORS Errors
- Make sure the API server is running on port 7071
- Check that `api/local.settings.json` has `"CORS": "*"` in the Host section
- If opening from file://, ensure the API_BASE is set to `http://localhost:7071/api`

### API Not Found
- Verify the API server is running: `http://localhost:7071/api/users` should return data
- Check browser console for specific error messages
- Ensure database connection is configured in `api/local.settings.json`

### Database Connection Issues
- Run the database schemas in Neon console:
  - `db/schema.sql` (hospital data)
  - `db/users_schema.sql` (users and activity logs)
- Verify `DATABASE_URL` in `api/local.settings.json`



