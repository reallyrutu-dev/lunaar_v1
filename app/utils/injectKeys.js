
export function injectKeys(files, keys) {
    if (!keys?.supabase_url || !keys?.supabase_anon_key) return files
    return files.map((f) => ({
        ...f,
        content: f.content
            .split("YOUR_SUPABASE_URL")
            .join(keys.supabase_url)
            .split("YOUR_SUPABASE_ANON_KEY")
            .join(keys.supabase_anon_key),
    }))
}