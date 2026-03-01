# Azure Functions Setup

## Install Azure Functions Core Tools

The `func` command is required to run Azure Functions locally. Install it using one of these methods:

### Option 1: Using npm (Recommended)
```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

### Option 2: Using Chocolatey (Windows)
```bash
choco install azure-functions-core-tools-4
```

### Option 3: Using Homebrew (Mac)
```bash
brew tap azure/functions
brew install azure-functions-core-tools@4
```

### Option 4: Manual Installation (Windows)
1. Download the installer from: https://github.com/Azure/azure-functions-core-tools/releases
2. Download the latest `Azure.Functions.Cli.*.msi` file
3. Run the installer

## Verify Installation

After installation, verify it works:
```bash
func --version
```

You should see a version number like `4.x.x`.

## Running the API

Once Azure Functions Core Tools is installed:

```bash
cd api
npm install
npm run build
npm run dev
```

The API will start on `http://localhost:7071`

## Alternative: Use Node.js directly (Development Only)

If you can't install Azure Functions Core Tools, you can create a simple Node.js server for development:

```bash
cd api
npm install express cors
```

Then create a simple `server.js` file to run the functions manually. However, this is not recommended for production.



