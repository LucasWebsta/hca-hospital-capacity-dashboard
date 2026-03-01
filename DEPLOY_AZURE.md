# Deploying to Azure

This guide covers deploying the HCA Census Dashboard to Azure using Azure Static Web Apps + Azure Functions.

## Prerequisites

1. **Azure Account** - Sign up at https://azure.microsoft.com/free/
2. **Azure CLI** (optional but recommended)
   ```bash
   # Install Azure CLI
   winget install Microsoft.AzureCLI
   ```
3. **GitHub Account** - Your code should be in a GitHub repository

## Deployment Steps

### Step 1: Create Azure Static Web App

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource**
3. Search for **"Static Web App"** and select it
4. Click **Create**
5. Fill in the form:
   - **Subscription**: Your Azure subscription
   - **Resource Group**: Create new (e.g., `hca-census-rg`)
   - **Name**: `hca-census-dashboard` (must be globally unique)
   - **Plan type**: Free (for testing) or Standard (for production)
   - **Region**: `Central Chile` (required by your subscription policy)
   - **Source**: GitHub
   - **Sign in with GitHub**: Authorize Azure
   - **Organization**: `jweaver5-code`
   - **Repository**: `innovate26`
   - **Branch**: `main` (or your deployment branch)
   - **Build Presets**: Custom
   - **App location**: `/` (root directory)
   - **Api location**: `api`
   - **Output location**: `dist`

6. Click **Review + create**, then **Create**

### Step 2: Configure Environment Variables

After the Static Web App is created:

1. Go to your Static Web App in Azure Portal
2. Navigate to **Configuration** → **Application settings**
3. Add the following environment variables:

   ```
   DATABASE_URL = your-postgresql-connection-string
   ```

   Example:
   ```
   DATABASE_URL = postgresql://username:password@host:port/database?sslmode=require
   ```

4. Click **Save**

### Step 3: Update API Configuration

The API functions will automatically use the `DATABASE_URL` environment variable from Azure.

### Step 4: Verify Deployment

1. After creation, Azure will automatically:
   - Create a GitHub Actions workflow
   - Trigger the first deployment
   - Provide you with a deployment URL

2. Check the deployment:
   - Go to **Deployment history** in Azure Portal
   - Or check **Actions** tab in your GitHub repository

3. Your app will be available at:
   ```
   https://<your-app-name>.azurestaticapps.net
   ```

## Manual Deployment (Alternative)

If you prefer to deploy manually without GitHub Actions:

### Using Azure CLI

```bash
# Login to Azure
az login

# Create Static Web App
az staticwebapp create \
  --name hca-census-dashboard \
  --resource-group hca-census-rg \
  --sku Free \
  --location "centralchile" \
  --source https://github.com/jweaver5-code/innovate26 \
  --branch main \
  --app-location "/" \
  --api-location "api" \
  --output-location "dist"

# Set environment variable
az staticwebapp appsettings set \
  --name hca-census-dashboard \
  --resource-group hca-census-rg \
  --setting-names DATABASE_URL="your-connection-string"
```

### Using Azure Functions Core Tools

If you want to deploy just the API separately:

```bash
cd api

# Login to Azure
az login

# Create Function App (if not using Static Web Apps)
az functionapp create \
  --resource-group hca-census-rg \
  --consumption-plan-location "centralchile" \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name hca-census-api \
  --storage-account <storage-account-name>

# Deploy Functions
func azure functionapp publish hca-census-api

# Set environment variable
az functionapp config appsettings set \
  --name hca-census-api \
  --resource-group hca-census-rg \
  --settings DATABASE_URL="your-connection-string"
```

## Build Configuration

The GitHub Actions workflow will:
1. Install dependencies (with `--legacy-peer-deps` for React 19 compatibility)
2. Build the frontend (`npm run build` → outputs to `dist/`)
3. Build the API TypeScript (`cd api && npm run build`)
4. Deploy both to Azure Static Web Apps

## Troubleshooting

### Build Fails

- Check GitHub Actions logs
- Verify `package.json` scripts are correct
- Ensure `dist/` folder is generated after build

### API Not Working

- Verify `DATABASE_URL` is set in Azure Portal
- Check Function App logs in Azure Portal
- Ensure API routes are in `api/src/functions/`

### CORS Issues

- Azure Static Web Apps handles CORS automatically
- If issues persist, check `staticwebapp.config.json`

### Database Connection

- Verify PostgreSQL connection string format
- Check firewall rules allow Azure IPs
- Ensure SSL is enabled in connection string

## Cost Estimate

- **Free Tier**: 
  - 100 GB bandwidth/month
  - 2 GB storage
  - 2 million function executions/month
  - Perfect for development/testing

- **Standard Tier**: 
  - $9/month base
  - Additional bandwidth/storage as needed
  - Recommended for production

## Next Steps

1. Set up custom domain (optional)
2. Configure authentication (if needed)
3. Set up monitoring with Application Insights
4. Configure backup and disaster recovery

## Resources

- [Azure Static Web Apps Docs](https://docs.microsoft.com/azure/static-web-apps/)
- [Azure Functions Docs](https://docs.microsoft.com/azure/azure-functions/)
- [GitHub Actions for Azure](https://github.com/Azure/actions)

