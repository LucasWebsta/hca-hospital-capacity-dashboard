# Installing Azure Functions Core Tools

The error `'func' is not recognized` means Azure Functions Core Tools is not installed.

## Quick Install (Windows)

### Option 1: Using npm (Recommended)
```powershell
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

**Note:** You may need to run PowerShell as Administrator for global npm installs.

### Option 2: Using Chocolatey
If you have Chocolatey installed:
```powershell
choco install azure-functions-core-tools-4
```

### Option 3: Manual Download
1. Go to: https://github.com/Azure/azure-functions-core-tools/releases
2. Download the latest `Azure.Functions.Cli.win-x64.*.zip` file
3. Extract to a folder (e.g., `C:\tools\AzureFunctions`)
4. Add that folder to your PATH environment variable

### Option 4: Using winget (Windows 10/11)
```powershell
winget install Microsoft.AzureFunctionsCoreTools
```

## Verify Installation

After installation, close and reopen your terminal, then run:
```powershell
func --version
```

You should see a version number like `4.x.x`.

## After Installation

Once `func` is installed, you can run:
```powershell
cd api
npm run dev
```

## Troubleshooting

If `func` still isn't recognized after installation:
1. Close and reopen your terminal/PowerShell
2. Check your PATH: `$env:PATH`
3. Restart your computer if needed
4. Verify installation location and add to PATH manually



