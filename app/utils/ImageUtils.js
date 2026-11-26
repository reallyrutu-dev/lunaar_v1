
// Resizes an image file and returns a JPEG data URL ("data:image/jpeg;base64,...")
export async function fileToResizedDataUrl(file, maxSide = 1280, quality = 0.85) {
    if (!file.type.startsWith("image/")) throw new Error("Only image files are supported")

    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    return canvas.toDataURL("image/jpeg", quality)
}