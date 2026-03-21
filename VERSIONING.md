# Versioning & Release Strategy

## Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

**Format:** `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

- **MAJOR**: Breaking changes (e.g., `1.0.0` → `2.0.0`)
- **MINOR**: New features, backward compatible (e.g., `1.0.0` → `1.1.0`)
- **PATCH**: Bug fixes, backward compatible (e.g., `1.0.0` → `1.0.1`)

## Version Files

### `package.json`
```json
{
  "version": "1.0.0"
}
```

### `android/app/build.gradle`
```gradle
versionCode 1       // Integer, increment for each release
versionName "1.0.0" // Matches package.json
```

### `capacitor.config.ts`
```typescript
version: '1.0.0',  // Optional but recommended
```

## Release Process

### 1. Update Version

```bash
# Bump version (automatically updates package.json)
npm version patch  # For bug fixes (1.0.0 → 1.0.1)
npm version minor  # For new features (1.0.0 → 1.1.0)
npm version major  # For breaking changes (1.0.0 → 2.0.0)
```

### 2. Update Android Version

Manually edit `android/app/build.gradle`:

```gradle
versionCode = <increment by 1>
versionName = "<match package.json>"
```

**Example:**
```gradle
versionCode = 2
versionName = "1.0.1"
```

### 3. Create Git Tag

```bash
git add .
git commit -m "chore: bump version to 1.0.1"
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin main --tags
```

### 4. Build Release

```bash
# Web production build
npm run build

# Android APK
npm run build:apk:release

# Verify APK was created
ls android/app/build/outputs/apk/release/
```

### 5. Generate Release Notes

Create `CHANGELOG.md` entry:

```markdown
## [1.0.1] - 2026-03-20

### Fixed
- Fixed customer login OTP verification
- Resolved offline queue sync issue

### Security
- Updated environment variable validation
- Improved error logging
```

## Automation Script

Create `scripts/release.sh`:

```bash
#!/bin/bash
set -e

# Usage: ./scripts/release.sh patch|minor|major

RELEASE_TYPE=$1

if [ -z "$RELEASE_TYPE" ]; then
  echo "Usage: ./scripts/release.sh patch|minor|major"
  exit 1
fi

echo "📦 Starting release process..."

# 1. Run tests
echo "🧪 Running tests..."
npm test

# 2. Lint check
echo "🔍 Running linter..."
npm run lint

# 3. Bump version
echo "⬆️  Bumping version ($RELEASE_TYPE)..."
npm version $RELEASE_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version: $NEW_VERSION"

# 4. Update Android version
echo "📱 Updating Android version..."
# TODO: Add sed/awk command to update build.gradle

# 5. Build web
echo "🌐 Building web app..."
npm run build

# 6. Commit and tag
echo "📝 Creating git commit and tag..."
git add .
git commit -m "chore: release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "✅ Release v$NEW_VERSION ready!"
echo ""
echo "Next steps:"
echo "1. Push changes: git push origin main --tags"
echo "2. Build Android APK: npm run build:apk:release"
echo "3. Update CHANGELOG.md"
echo "4. Create GitHub release"
```

Make executable:
```bash
chmod +x scripts/release.sh
```

## CI/CD Integration

### GitHub Actions (`.github/workflows/release.yml`)

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Build web app
        run: npm run build
      
      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          draft: false
          prerelease: false
```

## Version Display in App

Create `src/lib/version.ts`:

```typescript
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';
export const BUILD_TIME = import.meta.env.VITE_BUILD_TIME || new Date().toISOString();
```

Update `vite.config.ts`:

```typescript
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  // ... rest of config
});
```

Display in app (e.g., Settings page):

```tsx
import { APP_VERSION, BUILD_TIME } from '@/lib/version';

<div className="text-xs text-muted-foreground">
  Version {APP_VERSION} • Built {new Date(BUILD_TIME).toLocaleDateString()}
</div>
```

## Current Version

**Starting point:** `1.0.0` (first production release)

## Google Play Store Requirements

When publishing to Play Store:
- `versionCode` must be incremented for each upload
- `versionName` should match semantic version
- First release typically uses `versionCode = 1`, `versionName = "1.0.0"`

## Hotfix Process

For urgent fixes to production:

```bash
# Create hotfix branch from production tag
git checkout -b hotfix/1.0.1 v1.0.0

# Make fix
# Test thoroughly

# Bump patch version
npm version patch

# Merge to main
git checkout main
git merge hotfix/1.0.1
git push origin main --tags

# Build and deploy
npm run build:apk:release
```

## Checklist

Before each release:

- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Version bumped in package.json
- [ ] Version bumped in android/app/build.gradle
- [ ] CHANGELOG.md updated
- [ ] Git tag created
- [ ] Release notes written
- [ ] APK built and tested
- [ ] Deployed to Vercel (web)
- [ ] Uploaded to Play Store (mobile)
