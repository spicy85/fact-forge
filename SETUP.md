# Package.json Scripts Setup

The following scripts should be added to `package.json` for formatting and linting:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js",
    "check": "tsc",
    "db:push": "drizzle-kit push",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "test": "echo \"No tests configured yet\" && exit 0"
  }
}
```

## Usage

### Formatting
- `npm run format` - Format all files
- `npm run format:check` - Check formatting without modifying files

### Linting
- `npm run lint` - Check for linting errors
- `npm run lint:fix` - Auto-fix linting errors where possible

### Testing
- `npm test` - Placeholder for future test suite

## Configuration Files

- `.prettierrc` - Prettier configuration
- `.eslintrc.json` - ESLint configuration with TypeScript support