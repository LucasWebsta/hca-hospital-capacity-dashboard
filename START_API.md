# Starting the API Server

## Quick Start

### Option 1: Use the Batch File (Windows)
Double-click `api/start-server.bat` - it will:
1. Install dependencies if needed
2. Build TypeScript
3. Start the server

### Option 2: Manual Start

1. **Open a terminal in the `api` folder:**
   ```powershell
   cd innovate26\api
   ```

2. **Install dependencies (first time only):**
   ```powershell
   npm install
   ```

3. **Build TypeScript:**
   ```powershell
   npm run build
   ```

4. **Start the server:**
   ```powershell
   npm run dev:express
   ```

5. **You should see:**
   ```
   🚀 HCA Census API Server running on http://localhost:7071
   📡 Available endpoints:
      GET /api/census
      GET /api/facilities
      ...
   ```

## Verify It's Running

Open in your browser: `http://localhost:7071/api/users`

You should see a JSON array of users (or an empty array `[]` if no users exist yet).

## Troubleshooting

### Port 7071 Already in Use
If you get an error about port 7071 being in use:
1. Close any other instances of the server
2. Or change the port in `server.js` (line 7)

### Build Errors
If `npm run build` fails:
- Check that TypeScript is installed: `npm install typescript --save-dev`
- Verify all function files are in `api/src/functions/`

### Database Connection Errors
- Make sure `api/local.settings.json` exists with the correct `DATABASE_URL`
- Verify the database schema has been run in Neon console

### Still Not Working?
1. Check the terminal output for specific error messages
2. Verify Node.js is installed: `node --version`
3. Make sure you're in the `api` directory when running commands



