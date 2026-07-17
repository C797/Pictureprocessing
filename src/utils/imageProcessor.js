/**
 * 使用 Canvas 实现图片分辨率放大（2x / 4x / 8x）
 * 放大后自动对图片进行锐化处理，使图像更清晰
 * 同时支持图片压缩（JPEG 质量压缩）
 */

/**
 * 将图片按照指定倍数放大，放大后自动锐化
 */
export function upscaleImage(img, scale) {
  return new Promise((resolve, reject) => {
    try {
      const srcW = img.naturalWidth || img.width
      const srcH = img.naturalHeight || img.height
      const destW = srcW * scale
      const destH = srcH * scale

      const steps = Math.ceil(Math.log(scale) / Math.log(2))
      const stepScale = Math.pow(scale, 1 / steps)

      let currentCanvas = document.createElement('canvas')
      let currentCtx = currentCanvas.getContext('2d')

      currentCanvas.width = srcW
      currentCanvas.height = srcH
      currentCtx.drawImage(img, 0, 0)

      for (let i = 0; i < steps; i++) {
        const stepW = Math.round(srcW * Math.pow(stepScale, i + 1))
        const stepH = Math.round(srcH * Math.pow(stepScale, i + 1))

        const nextCanvas = document.createElement('canvas')
        nextCanvas.width = stepW
        nextCanvas.height = stepH
        const nextCtx = nextCanvas.getContext('2d')

        nextCtx.imageSmoothingEnabled = true
        nextCtx.imageSmoothingQuality = 'high'

        nextCtx.drawImage(currentCanvas, 0, 0, stepW, stepH)

        if (i < steps - 1) {
          applySharpen(nextCtx, stepW, stepH, 0.3)
        }

        currentCanvas = nextCanvas
        currentCtx = nextCtx
      }

      if (currentCanvas.width !== destW || currentCanvas.height !== destH) {
        const finalCanvas = document.createElement('canvas')
        finalCanvas.width = destW
        finalCanvas.height = destH
        const finalCtx = finalCanvas.getContext('2d')
        finalCtx.imageSmoothingEnabled = true
        finalCtx.imageSmoothingQuality = 'high'
        finalCtx.drawImage(currentCanvas, 0, 0, destW, destH)
        currentCanvas = finalCanvas
        currentCtx = finalCtx
      }

      const sharpenAmount = Math.min(0.4 + (scale - 2) * 0.15, 1.0)
      applySharpen(currentCtx, destW, destH, sharpenAmount)

      resolve(currentCanvas.toDataURL('image/png'))
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * 压缩图片为 JPEG 格式，通过 quality 控制质量
 * @param {HTMLImageElement} img - 原始图片元素
 * @param {number} quality - 压缩质量百分比 (1~100)，对应 Canvas toDataURL 的 0.01~1.0
 * @returns {Promise<string>} 返回压缩后的图片 Data URL（image/jpeg）
 */
export function compressImage(img, qualityPercent) {
  return new Promise((resolve, reject) => {
    try {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      ctx.drawImage(img, 0, 0, w, h)

      // 转换为 JPEG —— qualityPercent (1~100) 映射为 0.01~1.0
      const quality = Math.max(0.01, Math.min(1, qualityPercent / 100))
      resolve(canvas.toDataURL('image/jpeg', quality))
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * 对 Canvas 上下文中的图像应用锐化滤镜
 */
function applySharpen(ctx, w, h, amount) {
  if (amount <= 0) return

  const imageData = ctx.getImageData(0, 0, w, h)
  const src = imageData.data
  const dest = new Uint8ClampedArray(src.length)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4

      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        dest[idx] = src[idx]
        dest[idx + 1] = src[idx + 1]
        dest[idx + 2] = src[idx + 2]
        dest[idx + 3] = src[idx + 3]
        continue
      }

      for (let c = 0; c < 3; c++) {
        const center = src[idx + c]
        const top = src[((y - 1) * w + x) * 4 + c]
        const bottom = src[((y + 1) * w + x) * 4 + c]
        const left = src[(y * w + (x - 1)) * 4 + c]
        const right = src[(y * w + (x + 1)) * 4 + c]

        const sharpened = 5 * center - top - bottom - left - right
        dest[idx + c] = Math.round(center + (sharpened - center) * amount)
      }
      dest[idx + 3] = src[idx + 3]
    }
  }

  imageData.data.set(dest)
  ctx.putImageData(imageData, 0, 0)
}

/**
 * 将 File 对象转换为 HTMLImageElement
 */
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 估算 Data URL 的文件大小（字节）
 */
export function estimateDataURLSize(dataURL) {
  const base64 = dataURL.split(',')[1]
  if (!base64) return 0
  // Base64 → 字节数: length * 3 / 4，减去 padding
  return Math.round((base64.length * 3) / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0))
}

/**
 * 将 Data URL 转换为 Blob 用于下载
 */
export function dataURLToBlob(dataURL) {
  const parts = dataURL.split(',')
  const mime = parts[0].match(/:(.*?);/)[1]
  const bytes = atob(parts[1])
  const ab = new ArrayBuffer(bytes.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < bytes.length; i++) {
    ia[i] = bytes.charCodeAt(i)
  }
  return new Blob([ab], { type: mime })
}

/**
 * 触发下载
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 格式化字节数为人类可读字符串
 */
export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}
