export const WORKFLOW_FILE = "build-apk.yml"
export const WORKFLOW_PATH = ".github/workflows/build-apk.yml"

export const APK_WORKFLOW = `name: Build APK

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      GRADLE_OPTS: -Dorg.gradle.jvmargs=-Xmx4g
      EXPO_NO_TELEMETRY: 1
      CI: 1
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: false

      - name: Cache npm
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: npm-$\{{ runner.os }}-$\{{ hashFiles('mobile/package.json') }}
          restore-keys: |
            npm-$\{{ runner.os }}-

      - name: Install dependencies
        run: npm install --prefer-offline --no-audit --no-fund

      - name: Align Expo packages
        run: |
          if grep -q '"react-native-reanimated"' package.json && ! grep -q '"react-native-worklets"' package.json; then
            npx expo install react-native-worklets
          fi
          npx expo install --fix
          npm dedupe --no-audit --no-fund
          npm ls expo expo-modules-core expo-modules-autolinking || true

      - name: Prepare app config
        run: |
          node - <<'NODE'
          const fs = require("fs")
          const config = JSON.parse(fs.readFileSync("app.json", "utf8"))
          const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
          config.expo = config.expo || {}
          config.expo.name = config.expo.name || "App"
          config.expo.slug = config.expo.slug || "app"
          config.expo.scheme = config.expo.scheme || "lunaarapp"
          config.expo.android = config.expo.android || {}
          config.expo.android.package = config.expo.android.package || "com.lunaar.app" + process.env.GITHUB_REPOSITORY_ID
          config.expo.plugins = config.expo.plugins || []
          if (deps["expo-router"]) {
            const hasRouter = config.expo.plugins.some((p) => p === "expo-router" || (Array.isArray(p) && p[0] === "expo-router"))
            if (!hasRouter) config.expo.plugins.push("expo-router")
          }
          fs.writeFileSync("app.json", JSON.stringify(config, null, 2))
          NODE

      - name: Prebuild Android project
        run: |
          npx expo prebuild --platform android --no-install
          echo "" >> android/gradle.properties
          echo "org.gradle.caching=true" >> android/gradle.properties
          echo "org.gradle.parallel=true" >> android/gradle.properties

      - name: Build release APK
        working-directory: mobile/android
        run: ./gradlew assembleRelease --build-cache --parallel -PreactNativeArchitectures=arm64-v8a

      - name: Publish APK
        env:
          GH_TOKEN: $\{{ secrets.GITHUB_TOKEN }}
        run: |
          export GH_REPO=$GITHUB_REPOSITORY
          cp android/app/build/outputs/apk/release/app-release.apk app-release.apk
          gh release create "apk-$GITHUB_RUN_NUMBER" app-release.apk --title "APK $GITHUB_RUN_NUMBER" --notes "Built from $GITHUB_SHA" --target "$GITHUB_SHA"
`