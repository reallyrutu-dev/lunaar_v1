import fs from "node:fs"
import path from "node:path"

export const SDK = "57"

const TEMPLATE_DIR = path.resolve(
    /*turbopackIgnore: true*/
    process.env.TEMPLATE_DIR || path.join(process.cwd(), "sandbox", "expo-template")
)

const readJson = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"))
    } catch {
        return null
    }
}

const bundled = readJson(path.join(TEMPLATE_DIR, "node_modules", "expo", "bundledNativeModules.json")) || {}
const templatePkg = readJson(path.join(TEMPLATE_DIR, "package.json")) || {}
const templateDeps = { ...(templatePkg.dependencies || {}), ...(templatePkg.devDependencies || {}) }

const MANUAL = {
    "@react-navigation/native": "^7.1.0",
    "@react-navigation/native-stack": "^7.3.0",
    "@react-navigation/bottom-tabs": "^7.3.0",
    "@supabase/supabase-js": "^2.45.0",
    "date-fns": "^4.1.0",
    "zod": "^3.23.0",
}

const FONT_VERSION = "^0.4.0"

const EXPO_NAMES = [
    "expo",
    "react",
    "react-dom",
    "react-native",
    "react-native-web",
    "@expo/metro-runtime",
    "expo-status-bar",
    "expo-font",
    "expo-haptics",
    "expo-sensors",
    "expo-linear-gradient",
    "react-native-safe-area-context",
    "react-native-screens",
    "@react-native-async-storage/async-storage",
    "@expo/vector-icons",
]

const versionFor = (name) => bundled[name] ?? templateDeps[name] ?? null

export const EXPO_VERSIONS = Object.fromEntries(
    EXPO_NAMES.map((n) => [n, versionFor(n)]).filter(([, v]) => v)
)
export const JS_VERSIONS = MANUAL

const ALL = { ...EXPO_VERSIONS, ...JS_VERSIONS }
const ALWAYS = ["expo", "react", "react-dom", "react-native", "react-native-web", "@expo/metro-runtime"]

const missing = EXPO_NAMES.filter((n) => !ALL[n])
if (missing.length > 0) console.log("sdkVersions: no version found for", missing.join(", "))

export const pinPackageJson = (content) => {
    try {
        const pkg = JSON.parse(content)
        const deps = {}
        for (const name of Object.keys(pkg.dependencies || {})) {
            if (name.startsWith("@expo-google-fonts/")) deps[name] = FONT_VERSION
            else if (ALL[name]) deps[name] = ALL[name]
        }
        for (const name of ALWAYS) if (ALL[name]) deps[name] = ALL[name]
        const { devDependencies, ...rest } = pkg
        return JSON.stringify({ ...rest, main: "node_modules/expo/AppEntry.js", dependencies: deps }, null, 2)
    } catch {
        return content
    }
}