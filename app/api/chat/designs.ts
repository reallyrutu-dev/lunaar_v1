import { System_prompt } from "./SystemPrompt"

type Palette = Record<string, string>

type FontInfo = { pkg: string; prefix: string }

export const FONTS: Record<string, FontInfo> = {
    "Inter": { pkg: "inter", prefix: "Inter" },
    "DM Sans": { pkg: "dm-sans", prefix: "DMSans" },
    "Manrope": { pkg: "manrope", prefix: "Manrope" },
    "Plus Jakarta Sans": { pkg: "plus-jakarta-sans", prefix: "PlusJakartaSans" },
    "Space Grotesk": { pkg: "space-grotesk", prefix: "SpaceGrotesk" },
    "Sora": { pkg: "sora", prefix: "Sora" },
    "Outfit": { pkg: "outfit", prefix: "Outfit" },
    "Nunito": { pkg: "nunito", prefix: "Nunito" },
    "Lora": { pkg: "lora", prefix: "Lora" },
}

const DIRECTIONS = ["calm light", "dark utility", "warm editorial", "crisp fintech", "playful soft"]
const CARDS = ["bordered", "tinted", "raised"]
const BUTTONS = ["solid", "soft", "outline"]
const DENSITIES = ["compact", "comfortable", "roomy"]
const PALETTE_KEYS = [
    "background",
    "surface",
    "surfaceAlt",
    "border",
    "text",
    "textMuted",
    "accent",
    "accentText",
    "success",
    "danger",
]
const THEME_PATH = "mobile/constants/theme.ts"
const APP_PATH = "mobile/App.js"
const PACKAGE_PATH = "mobile/package.json"
const HEX = /^#[0-9a-fA-F]{6}$/

const STARTS = [
    { direction: "calm light", mood: "airy, soft neutrals, quiet and focused", radius: "14 to 18", look: "card bordered, button soft, density comfortable" },
    { direction: "dark utility", mood: "dark layered surfaces, dense, functional, high contrast", radius: "8 to 12", look: "card tinted, button outline or solid, density compact" },
    { direction: "warm editorial", mood: "warm off-white, serif display type, generous spacing", radius: "10 to 14", look: "card tinted, button solid, density roomy" },
    { direction: "crisp fintech", mood: "white and ink, sharp, numeric focus", radius: "8 to 12", look: "card bordered, button solid, density compact" },
    { direction: "playful soft", mood: "rounded, friendly, colorful accent", radius: "18 to 24", look: "card raised, button soft or solid, density roomy" },
]

const HUES = [
    "terracotta",
    "deep forest green",
    "petrol blue",
    "amber",
    "rose",
    "olive",
    "slate blue",
    "coral",
    "ochre",
    "burgundy",
    "sage",
    "steel teal",
    "clay orange",
    "plum brown",
    "lime-moss",
    "sky cyan",
]

const FONT_PAIRS = [
    ["DM Sans", "DM Sans"],
    ["DM Sans", "Lora"],
    ["Manrope", "Manrope"],
    ["Plus Jakarta Sans", "Plus Jakarta Sans"],
    ["Plus Jakarta Sans", "Lora"],
    ["Inter", "Space Grotesk"],
    ["Inter", "Sora"],
    ["Space Grotesk", "Space Grotesk"],
    ["Outfit", "Outfit"],
    ["Nunito", "Nunito"],
    ["Manrope", "Sora"],
    ["DM Sans", "Sora"],
]

const LAYOUTS = [
    "Bottom tabs. The home screen leads with one large summary card, then a list grouped under section headers.",
    "Bottom tabs. The home screen is a two-column grid of cards.",
    "Native stack only with a large-title home screen and one clear primary action button. Add tabs only when the app has three or more main areas.",
    "Bottom tabs. The home screen is a vertical timeline grouped by day.",
    "Bottom tabs. The home screen has a row of Chip filters at the top that changes the list below.",
    "Bottom tabs. The home screen opens with a horizontal scroll of featured cards, then sections with headers.",
    "Bottom tabs. The home screen is a dense list with leading avatars or icons and trailing numeric values.",
    "Native stack. The home screen is a dashboard: a grid of StatTile, then a recent activity list.",
]

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]

export const buildSystemPrompt = () => {
    const start = pick(STARTS)
    const hue = pick(HUES)
    const [font, display] = pick(FONT_PAIRS)
    const layout = pick(LAYOUTS)
    return [
        System_prompt,
        "",
        "DESIGN STARTING POINT FOR THIS BUILD",
        "This is inspiration, not a rule. Adapt or replace any part of it when the app's purpose or the user's words call for it, then record your final choices in the design object and mobile/constants/theme.ts.",
        `- suggested direction: ${start.direction} (${start.mood})`,
        `- suggested accent hue family: ${hue}`,
        `- suggested body font: ${font}`,
        `- suggested display font: ${display}`,
        `- suggested radius: ${start.radius}`,
        `- suggested look: ${start.look}`,
        `- suggested layout: ${layout}`,
    ].join("\n")
}

const parseHex = (value: unknown): [number, number, number] | null => {
    if (typeof value !== "string" || !HEX.test(value)) return null
    return [
        parseInt(value.slice(1, 3), 16),
        parseInt(value.slice(3, 5), 16),
        parseInt(value.slice(5, 7), 16),
    ]
}

const luminance = (rgb: [number, number, number]) => {
    const [r, g, b] = rgb.map((c) => {
        const v = c / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
    const ra = parseHex(a)
    const rb = parseHex(b)
    if (!ra || !rb) return 0
    const la = luminance(ra)
    const lb = luminance(rb)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const hueAndSaturation = (rgb: [number, number, number]) => {
    const [r, g, b] = rgb.map((c) => c / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    if (d === 0) return { hue: 0, saturation: 0 }
    const l = (max + min) / 2
    const saturation = d / (1 - Math.abs(2 * l - 1))
    let hue: number
    if (max === r) hue = ((g - b) / d) % 6
    else if (max === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
    hue = (hue * 60 + 360) % 360
    return { hue, saturation }
}

const isGray = (value: string) => {
    const rgb = parseHex(value)
    return !!rgb && rgb[0] === rgb[1] && rgb[1] === rgb[2]
}

const same = (a: string, b: string) => String(a).toLowerCase() === String(b).toLowerCase()

const checkPalette = (name: "light" | "dark", palette: Palette | undefined, problems: string[]) => {
    if (!palette || typeof palette !== "object") {
        problems.push(`design.${name} is missing`)
        return false
    }
    let valid = true
    for (const key of PALETTE_KEYS) {
        if (!HEX.test(String(palette[key] ?? ""))) {
            problems.push(`design.${name}.${key} must be a 6-digit hex color`)
            valid = false
        }
    }
    if (!valid) return false

    const p = palette
    const bg = parseHex(p.background)!
    const bgLum = luminance(bg)

    if (name === "light" && bgLum < 0.5) problems.push("design.light.background must be a light color")
    if (name === "dark" && bgLum > 0.12) problems.push("design.dark.background must be a dark color")

    for (const key of ["background", "surface", "text"]) {
        if (isGray(p[key]) || /^#(000000|ffffff)$/i.test(p[key])) {
            problems.push(`design.${name}.${key} must be tinted, not pure black, white or gray`)
        }
    }

    if (same(p.surface, p.background)) problems.push(`design.${name}.surface must differ from background`)
    if (same(p.surfaceAlt, p.surface)) problems.push(`design.${name}.surfaceAlt must differ from surface`)
    if (same(p.border, p.background)) problems.push(`design.${name}.border must differ from background`)

    if (name === "dark" && luminance(parseHex(p.surface)!) <= bgLum) {
        problems.push("design.dark.surface must be lighter than background")
    }

    const checks: [string, string, number, string][] = [
        [p.text, p.background, 7, "text on background"],
        [p.text, p.surface, 4.5, "text on surface"],
        [p.textMuted, p.background, 4.5, "textMuted on background"],
        [p.accentText, p.accent, 4.5, "accentText on accent"],
        [p.accent, p.background, 3, "accent on background"],
        [p.success, p.background, 3, "success on background"],
        [p.danger, p.background, 3, "danger on background"],
    ]
    for (const [fg, bgColor, min, label] of checks) {
        const ratio = contrast(fg, bgColor)
        if (ratio < min) {
            problems.push(`design.${name} ${label} contrast is ${ratio.toFixed(1)}, needs at least ${min}`)
        }
    }

    const { hue, saturation } = hueAndSaturation(parseHex(p.accent)!)
    if (saturation > 0.3 && hue >= 255 && hue <= 300) {
        problems.push(`design.${name}.accent is violet or indigo, which is not allowed`)
    }

    return true
}

const normalizeHexes = (palette: Palette) =>
    Object.fromEntries(
        Object.entries(palette).map(([k, v]) => [k, typeof v === "string" && HEX.test(v) ? v.toLowerCase() : v])
    )

export const validateDesign = (input: any) => {
    const problems: string[] = []

    if (!input || typeof input !== "object") {
        return { ok: false, problems: [`${THEME_PATH}: design object is missing`], design: null }
    }

    const design: any = { ...input }

    if (!DIRECTIONS.includes(design.direction)) problems.push(`design.direction must be one of: ${DIRECTIONS.join(", ")}`)
    if (!FONTS[design.font]) problems.push(`design.font must be one of: ${Object.keys(FONTS).join(", ")}`)
    if (!FONTS[design.display_font]) problems.push(`design.display_font must be one of: ${Object.keys(FONTS).join(", ")}`)

    const radius = Number(design.radius)
    if (!Number.isFinite(radius) || radius < 6 || radius > 28) problems.push("design.radius must be a number between 6 and 28")
    else design.radius = radius

    if (!CARDS.includes(design.card)) problems.push(`design.card must be one of: ${CARDS.join(", ")}`)
    if (!BUTTONS.includes(design.button)) problems.push(`design.button must be one of: ${BUTTONS.join(", ")}`)
    if (!DENSITIES.includes(design.density)) problems.push(`design.density must be one of: ${DENSITIES.join(", ")}`)

    const lightOk = checkPalette("light", design.light, problems)
    const darkOk = checkPalette("dark", design.dark, problems)

    if (lightOk) design.light = normalizeHexes(design.light)
    if (darkOk) design.dark = normalizeHexes(design.dark)

    if (lightOk && darkOk) {
        const main = design.direction === "dark utility" ? design.dark : design.light
        design.accent = main.accent
        design.background = main.background
        design.surface = main.surface
        design.ink = main.text
    }

    return {
        ok: problems.length === 0,
        problems: problems.map((p) => `${THEME_PATH}: ${p}`),
        design,
    }
}

const fileContent = (files: Map<string, any> | any[], path: string): string | null => {
    if (files instanceof Map) return files.get(path)?.content ?? null
    return files.find((f) => f?.path === path)?.content ?? null
}

export const validateThemeFile = (files: Map<string, any> | any[], design: any) => {
    const problems: string[] = []
    if (!design || typeof design !== "object") return problems

    const theme = fileContent(files, THEME_PATH)
    if (theme === null) return problems

    const lower = theme.toLowerCase()

    for (const mode of ["light", "dark"] as const) {
        const palette = design[mode]
        if (!palette) continue
        for (const key of PALETTE_KEYS) {
            const value = palette[key]
            if (typeof value === "string" && HEX.test(value) && !lower.includes(value.toLowerCase())) {
                problems.push(`${THEME_PATH}: palettes.${mode}.${key} must be ${value.toLowerCase()} to match the design`)
            }
        }
    }

    const body = FONTS[design.font]
    const display = FONTS[design.display_font]
    if (body) {
        for (const weight of ["400Regular", "500Medium", "600SemiBold"]) {
            if (!theme.includes(`${body.prefix}_${weight}`)) {
                problems.push(`${THEME_PATH}: fonts must use ${body.prefix}_${weight}`)
            }
        }
    }
    if (display && !theme.includes(`${display.prefix}_600SemiBold`)) {
        problems.push(`${THEME_PATH}: fonts.display must be ${display.prefix}_600SemiBold`)
    }

    if (Number.isFinite(Number(design.radius)) && !new RegExp(`md\\s*:\\s*${Number(design.radius)}\\b`).test(theme)) {
        problems.push(`${THEME_PATH}: radius.md must be ${Number(design.radius)}`)
    }

    for (const key of ["card", "button", "density"]) {
        if (design[key] && !theme.includes(`"${design[key]}"`) && !theme.includes(`'${design[key]}'`)) {
            problems.push(`${THEME_PATH}: look.${key} must be ${design[key]}`)
        }
    }

    const app = fileContent(files, APP_PATH)
    if (app !== null) {
        for (const font of new Set([body, display])) {
            if (font && !app.includes(`${font.prefix}_400Regular`)) {
                problems.push(`${APP_PATH}: must load ${font.prefix} fonts with useFonts`)
            }
        }
    }

    const pkg = fileContent(files, PACKAGE_PATH)
    if (pkg !== null) {
        for (const font of new Set([body, display])) {
            if (font && !pkg.includes(`@expo-google-fonts/${font.pkg}`)) {
                problems.push(`${PACKAGE_PATH}: must list @expo-google-fonts/${font.pkg}`)
            }
        }
    }

    return problems
}

export const validateDesignAndTheme = (files: Map<string, any> | any[], design: any) => {
    const result = validateDesign(design)
    const theme_problems = result.design ? validateThemeFile(files, result.design) : []
    return {
        ok: result.ok && theme_problems.length === 0,
        problems: [...result.problems, ...theme_problems],
        design: result.design,
    }
}