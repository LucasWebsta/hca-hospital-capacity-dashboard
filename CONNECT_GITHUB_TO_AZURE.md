# Connect GitHub to Existing Azure App Service

This guide shows how to connect your GitHub repository to an already created Azure App Service.

## Method 1: Azure Portal (Easiest)

### Step 1: Open Your App Service

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your App Service (search for it in the top search bar)
3. Click on your App Service name

### Step 2: Set Up Deployment Center

1. In the left sidebar, click **Deployment Center** (under Deployment)
2. Click **Settings** tab
3. Under **Source**, select **GitHub**
4. Click **Authorize** and sign in to GitHub
5. Authorize Azure to access your repositories

### Step 3: Configure Repository

1. **Organization**: Select `jweaver5-code`
2. **Repository**: Select `innovate26`
3. **Branch**: Select `main` (or your deployment branch)
4. **Build provider**: 
   - For Node.js/React apps: Select **GitHub Actions** (recommended)
   - Or select **App Service build service** (simpler but less control)

### Step 4: Configure Build Settings (if using GitHub Actions)

If you selected **GitHub Actions**:

1. **Runtime stack**: Select `Node 20 LTS` (or your Node version)
2. **Build commands**: 
   ```
   npm install --legacy-peer-deps
   npm run build
   ```
3. **Output directory**: `dist` (for Vite builds)

### Step 5: Save and Deploy

1. Click **Save**
2. Azure will create a GitHub Actions workflow file
3. The first deployment will start automatically
4. You can monitor progress in **Deployment Center** → **Logs**

## Method 2: Azure CLI

```bash
# Login to Azure
az login

# Set up GitHub deployment for your App Service
az webapp deployment source config \
  --name <your-app-service-name> \
  --resource-group <your-resource-group> \
  --repo-url https://github.com/jweaver5-code/innovate26 \
  --branch main \
  --manual-integration false \
  --git-token <your-github-personal-access-token>
```

**To get a GitHub Personal Access Token:**
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token
3. Select scopes: `repo` (full control of private repositories)
4. Copy the token and use it in the command above

## Method 3: Manual GitHub Actions Workflow

If you prefer to create the workflow file manually:

### Step 1: Create Workflow File

Create `.github/workflows/azure-webapps-deploy.yml`:

```yaml
name: Deploy to Azure App Service

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm install --legacy-peer-deps

      - name: Build
        run: |
          npm run build

      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v2
        with:
          app-name: '<your-app-service-name>'
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: './dist'
```

### Step 2: Get Publish Profile

1. Go to your App Service in Azure Portal
2. Click **Get publish profile** (top toolbar)
3. Download the `.PublishSettings` file
4. Copy its contents

### Step 3: Add Secret to GitHub

1. Go to your GitHub repository: `https://github.com/jweaver5-code/innovate26`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
5. Value: Paste the entire contents of the `.PublishSettings` file
6. Click **Add secret**

### Step 4: Commit and Push

```bash
git add .github/workflows/azure-webapps-deploy.yml
git commit -m "Add Azure deployment workflow"
git push origin main
```

## Configure Environment Variables

After connecting GitHub, set your environment variables:

### Via Azure Portal:

1. Go to your App Service
2. Click **Configuration** → **Application settings**
3. Click **+ New application setting**
4. Add:
   - **Name**: `DATABASE_URL`
   - **Value**: `postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
5. Click **Save**

### Via Azure CLI:

```bash
az webapp config appsettings set \
  --name <your-app-service-name> \
  --resource-group <your-resource-group> \
  --settings DATABASE_URL="postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

## Verify Deployment

1. **Check Deployment Status**:
   - Azure Portal → Your App Service → **Deployment Center** → **Logs**
   - GitHub → **Actions** tab

2. **Test Your App**:
   - Visit: `https://<your-app-service-name>.azurewebsites.net`

3. **View Logs**:
   - Azure Portal → Your App Service → **Log stream** (for real-time logs)
   - Or **Logs** → **Application Logging** (for stored logs)

## Troubleshooting

### Deployment Fails

- Check GitHub Actions logs in the **Actions** tab
- Verify build commands are correct
- Ensure `dist/` folder exists after build
- Check Node.js version matches your app

### App Not Loading

- Verify environment variables are set
- Check **Log stream** for errors
- Verify `dist/` folder structure matches what Azure expects
- Check **Configuration** → **General settings** → **Stack settings**

### GitHub Actions Not Triggering

- Verify workflow file is in `.github/workflows/`
- Check branch name matches (usually `main`)
- Verify GitHub Actions are enabled in repository settings

### Build Errors

- Check if `package.json` scripts are correct
- Verify all dependencies are in `package.json` (not just `devDependencies`)
- Check for Node.js version compatibility

## Next Steps

1. Set up **staging slots** for testing before production
2. Configure **custom domain** if needed
3. Set up **Application Insights** for monitoring
4. Configure **auto-scaling** if needed

## Resources

- [Azure App Service Deployment](https://docs.microsoft.com/azure/app-service/deploy-continuous-deployment)
- [GitHub Actions for Azure](https://github.com/Azure/actions)

