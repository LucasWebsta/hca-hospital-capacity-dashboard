# HCA Census Command API

Azure Functions API for the HCA Census Command dashboard.

## Setup

1. **Install Azure Functions Core Tools:**
   
   The `func` command is required. Install it globally:
   ```bash
   npm install -g azure-functions-core-tools@4 --unsafe-perm true
   ```
   
   Or use Chocolatey (Windows):
   ```bash
   choco install azure-functions-core-tools-4
   ```
   
   Verify installation:
   ```bash
   func --version
   ```

2. **Install dependencies:**
   ```bash
   cd api
   npm install
   ```

3. **Configure database connection:**
   The `local.settings.json` file contains the database connection string. This file is gitignored for security.

   For local development, create `local.settings.json` with:
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "UseDevelopmentStorage=true",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "DATABASE_URL": "your-database-connection-string"
     },
     "Host": {
       "CORS": "*"
     }
   }
   ```

3. **Build TypeScript:**
   ```bash
   npm run build
   ```

4. **Run locally:**

   **Option A: Using Azure Functions Core Tools (requires `func` command):**
   ```bash
   npm run dev
   ```
   This starts the Azure Functions runtime on `http://localhost:7071`

   **Option B: Using Express server (no `func` required):**
   ```bash
   npm run dev:express
   ```
   This starts a simple Express server on `http://localhost:7071` without requiring Azure Functions Core Tools.

## Database

The API connects to a PostgreSQL database (Neon). The schema is defined in `../db/schema.sql`.

### Connection String Format
```
postgresql://username:password@host:port/database?sslmode=require&channel_binding=require
```

## API Endpoints

- `GET /api/census` - Get overall census metrics
- `GET /api/facilities` - Get facility list with current census
- `GET /api/alerts` - Get active alerts
- `GET /api/trend?days=30` - Get occupancy trend data
- `GET /api/forecast?days=7` - Get forecast predictions

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (required)
- `FUNCTIONS_WORKER_RUNTIME` - Set to "node"
- `AzureWebJobsStorage` - Storage connection (use "UseDevelopmentStorage=true" for local dev)

