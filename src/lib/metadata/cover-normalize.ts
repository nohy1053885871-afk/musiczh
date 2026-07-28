/**
 * MP3 APIC 封面兼容性归一化。
 *
 * Finder / Quick Look 能读取的图片不代表各播放器的 ID3/APIC 路径都能读取。
 * Apple Music 对 APIC 内的 Adobe APP14 / Progressive JPEG 尤其挑剔；
 * 最通用的交集是 sRGB JFIF Baseline JPEG。
 */

const MAX_COVER_EDGE = 2000
const JPEG_QUALITY = 0.9
const JPEG_SCAN_BYTES = 128 * 1024

export async function normalizeCoverForMp3(cover: Blob): Promise<Blob> {
  const head = new Uint8Array(
    await cover.slice(0, JPEG_SCAN_BYTES).arrayBuffer(),
  )
  if (isMp3CompatibleJpeg(head)) {
    return cover.type === 'image/jpeg'
      ? cover
      : cover.slice(0, cover.size, 'image/jpeg')
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(cover, {
      imageOrientation: 'from-image',
    })
    const { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      MAX_COVER_EDGE,
    )
    const normalized = await renderBaselineJpeg(bitmap, width, height)
    const normalizedHead = new Uint8Array(
      await normalized.slice(0, JPEG_SCAN_BYTES).arrayBuffer(),
    )
    return isMp3CompatibleJpeg(normalizedHead) ? normalized : cover
  } catch {
    // 封面归一化失败不应让音频转码失败；保留原图，仍有播放器可以识别。
    return cover
  } finally {
    bitmap?.close()
  }
}

/** 兼容目标：JFIF + Baseline(SOF0)，且没有 Adobe APP14 / Progressive(SOF2)。 */
export function isMp3CompatibleJpeg(bytes: Uint8Array): boolean {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  ) {
    return false
  }

  let hasJfif = false
  let hasBaseline = false
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++
      continue
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) break
    const marker = bytes[offset++]
    if (marker === 0xda || marker === 0xd9) break
    if (marker >= 0xd0 && marker <= 0xd7) continue
    if (offset + 2 > bytes.length) break
    const size = bytes[offset] * 256 + bytes[offset + 1]
    if (size < 2 || offset + size > bytes.length) break
    const payload = offset + 2
    if (
      marker === 0xe0 &&
      payload + 5 <= bytes.length &&
      bytes[payload] === 0x4a &&
      bytes[payload + 1] === 0x46 &&
      bytes[payload + 2] === 0x49 &&
      bytes[payload + 3] === 0x46 &&
      bytes[payload + 4] === 0
    ) {
      hasJfif = true
    }
    if (marker === 0xee || marker === 0xc2) return false
    if (marker === 0xc0) hasBaseline = true
    offset += size
  }
  return hasJfif && hasBaseline
}

async function renderBaselineJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建封面画布')
    paintCover(context, bitmap, width, height)
    return canvas.convertToBlob({
      type: 'image/jpeg',
      quality: JPEG_QUALITY,
    })
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建封面画布')
    paintCover(context, bitmap, width, height)
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('封面 JPEG 编码失败'))
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
  }

  throw new Error('当前环境不支持封面归一化')
}

function paintCover(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
) {
  // JPEG 不支持透明通道；白底比默认黑底在浅色封面边缘更自然。
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
}

function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
