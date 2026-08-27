const MAX_INPUT_BYTES = 8 * 1024 * 1024
const MAX_OUTPUT_BYTES = 80 * 1024
const ICON_SIZE = 96

export function isImageIcon(icon: string | null | undefined): boolean {
  if (!icon) return false
  return icon.startsWith('data:image/') || /^https?:\/\//i.test(icon)
}

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Math.ceil((b64.length * 3) / 4)
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('無法讀取圖檔'))
    }
    img.src = url
  })
}

function drawIcon(img: HTMLImageElement, fillWhite: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIZE
  canvas.height = ICON_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('無法處理圖片')
  if (fillWhite) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE)
  } else {
    ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE)
  }
  const scale = Math.min(ICON_SIZE / img.width, ICON_SIZE / img.height, 1)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  ctx.drawImage(img, Math.round((ICON_SIZE - w) / 2), Math.round((ICON_SIZE - h) / 2), w, h)
  return canvas
}

/** 將上傳圖檔壓成約 96px 的 data URL，適合存在 tree_types.icon */
export async function fileToIconDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('請選擇圖片檔（JPG、PNG、WebP）')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('圖檔請小於 8 MB')
  }

  const img = await loadImage(file)
  const transparent = drawIcon(img, false)
  const candidates: string[] = []

  const webp = transparent.toDataURL('image/webp', 0.82)
  if (webp.startsWith('data:image/webp')) candidates.push(webp)
  candidates.push(transparent.toDataURL('image/png'))

  const small = candidates
    .filter((url) => dataUrlBytes(url) <= MAX_OUTPUT_BYTES)
    .sort((a, b) => dataUrlBytes(a) - dataUrlBytes(b))[0]
  if (small) return small

  const opaque = drawIcon(img, true)
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const jpeg = opaque.toDataURL('image/jpeg', quality)
    if (jpeg.startsWith('data:image/jpeg') && dataUrlBytes(jpeg) <= MAX_OUTPUT_BYTES) {
      return jpeg
    }
  }
  throw new Error('圖檔壓縮後仍太大，請換一張較簡單的圖示')
}
