import crypto from "crypto"

const ALGO = "aes-256-gcm"

function getKey() {
    const secret = process.env.ENCRYPTION_KEY
    if (!secret) throw new Error("ENCRYPTION_KEY is not set")
    return crypto.createHash("sha256").update(secret).digest()
}

export function encryptApiKey(plain) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
    const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()])
    const tag = cipher.getAuthTag()
    return [iv, tag, enc].map((b) => b.toString("base64")).join(":")
}

export function decryptApiKey(payload) {
    const [iv, tag, enc] = String(payload).split(":").map((p) => Buffer.from(p, "base64"))
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8")
}