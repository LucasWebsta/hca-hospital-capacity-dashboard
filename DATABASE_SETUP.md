# Database Connection Setup

The application is configured to connect to a PostgreSQL database hosted on Neon.

## Connection Details

The database connection string has been configured in `api/local.settings.json`:

```
postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

## Database Schema

The database schema is defined in `db/schema.sql`. Run this SQL script in your Neon database console to create the necessary tables:

1. `hospitals` - Master table of hospital facilities
2. `hospital_census` - Daily census snapshots
3. `forecast_data` - ML forecast predictions
4. `alerts` - System alerts

## Running the API Locally

1. **Navigate to the API directory:**
   ```bash
   cd api
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build TypeScript:**
   ```bash
   npm run build
   ```

4. **Start Azure Functions:**
   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:7071`

5. **Start the frontend (in another terminal):**
   ```bash
   cd ..
   npm run dev
   ```

   The frontend will proxy `/api/*` requests to the Azure Functions local server.

## API Endpoints

- `GET /api/census` - Overall census metrics
- `GET /api/facilities` - List of facilities with current census
- `GET /api/alerts` - Active alerts
- `GET /api/trend?days=30` - Historical occupancy trend
- `GET /api/forecast?days=7` - Forecast predictions

## Environment Variables

The `local.settings.json` file contains:
- `DATABASE_URL` - PostgreSQL connection string (configured)
- `FUNCTIONS_WORKER_RUNTIME` - Set to "node"
- `AzureWebJobsStorage` - Local development storage
- `CORS` - Set to "*" for development

## Security Note

⚠️ **Important:** The `api/local.settings.json` file is gitignored and should never be committed to version control as it contains sensitive database credentials.

For production deployments, configure these values in Azure Functions App Settings.




