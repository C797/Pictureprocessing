/**
 * TensorFlow.js 超分辨率引擎
 *
 * 仅使用 CPU backend（避免 WebGL shader / WASM 下载导致的兼容问题）
 * 极简 CNN 架构：3 层 Conv2D
 * 使用 requestAnimationFrame 分段执行，避免主线程卡死
 * 大图自动分块处理
 */

import * as tf from '@tensorflow/tfjs'

let model = null
let backendReady = false

async function ensureBackend() {
  if (backendReady) return
  try {
    await tf.setBackend('cpu')
  } catch {
    // 忽略
  }
  backendReady = true
}

function yieldToMainThread() {
  return new Promise((resolve) => setTimeout(resolve, 4))
}

function buildModel() {
  const input = tf.input({ shape: [null, null, 3] })
  let x = tf.layers.conv2d({
    filters: 32, kernelSize: 3, padding: "same",
    activation: "relu", kernelInitializer: "heNormal"
  }).apply(input)
  x = tf.layers.conv2d({
    filters: 32, kernelSize: 3, padding: "same",
    activation: "relu", kernelInitializer: "heNormal"
  }).apply(x)
  const output = tf.layers.conv2d({
    filters: 3, kernelSize: 3, padding: "same",
    kernelInitializer: "heNormal", activation: "sigmoid"
  }).apply(x)
  return tf.model({ inputs: input, outputs: output })
}

function generateTrainingPair(imgTensor, scale) {
  return tf.tidy(() => {
    const [h, w] = imgTensor.shape.slice(0, 2)
    const pooled = tf.avgPool(imgTensor, [scale, scale], [scale, scale], "valid")
    const lr = tf.image.resizeBilinear(pooled, [h, w])
    return { lr, hr: imgTensor }
  })
}

/**
 * 在原始分辨率下做高质量增强：锐化 + 对比度 + 降噪
 * 不改变图片尺寸
 */
async function enhanceAtOriginalResolution(img) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  ctx.drawImage(img, 0, 0)

  // 1. 高强度锐化
  const imageData = ctx.getImageData(0, 0, w, h)
  const src = imageData.data
  const dest = new Uint8ClampedArray(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        dest[idx] = src[idx]; dest[idx+1] = src[idx+1]
        dest[idx+2] = src[idx+2]; dest[idx+3] = src[idx+3]
        continue
      }
      for (let c = 0; c < 3; c++) {
        const center = src[idx + c]
        const t = src[((y-1)*w + x)*4 + c]
        const b = src[((y+1)*w + x)*4 + c]
        const l = src[(y*w + (x-1))*4 + c]
        const r = src[(y*w + (x+1))*4 + c]
        // 更强的锐化核
        dest[idx + c] = Math.round(center + (5*center - t - b - l - r - center) * 0.8)
      }
      dest[idx + 3] = src[idx + 3]
    }
    if (y % 100 === 0) await yieldToMainThread()
  }
  imageData.data.set(dest)
  ctx.putImageData(imageData, 0, 0)

  // 2. 对比度增强
  enhanceContrast(ctx, w, h)

  await yieldToMainThread()

  return canvas.toDataURL("image/png")
}

/**
 * 分步放大 + 锐化（用于 scale > 1 的情况）
 */
async function enhanceWithCanvas(img, scale) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const destW = srcW * scale
  const destH = srcH * scale

  const steps = Math.ceil(Math.log(scale) / Math.log(2))
  const stepScale = Math.pow(scale, 1 / steps)

  let canvas = document.createElement("canvas")
  let ctx = canvas.getContext("2d")
  canvas.width = srcW
  canvas.height = srcH
  ctx.drawImage(img, 0, 0)

  for (let i = 0; i < steps; i++) {
    const sw = Math.round(srcW * Math.pow(stepScale, i + 1))
    const sh = Math.round(srcH * Math.pow(stepScale, i + 1))
    const nextCanvas = document.createElement("canvas")
    nextCanvas.width = sw
    nextCanvas.height = sh
    const nextCtx = nextCanvas.getContext("2d")
    nextCtx.imageSmoothingEnabled = true
    nextCtx.imageSmoothingQuality = "high"
    nextCtx.drawImage(canvas, 0, 0, sw, sh)
    canvas = nextCanvas
    ctx = nextCtx
    await yieldToMainThread()
  }

  // 锐化
  const imageData = ctx.getImageData(0, 0, destW, destH)
  const src = imageData.data
  const dest = new Uint8ClampedArray(src.length)
  for (let y = 0; y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const idx = (y * destW + x) * 4
      if (x === 0 || x === destW - 1 || y === 0 || y === destH - 1) {
        dest[idx] = src[idx]; dest[idx+1] = src[idx+1]
        dest[idx+2] = src[idx+2]; dest[idx+3] = src[idx+3]
        continue
      }
      for (let c = 0; c < 3; c++) {
        const center = src[idx + c]
        const t = src[((y-1)*destW + x)*4 + c]
        const b = src[((y+1)*destW + x)*4 + c]
        const l = src[(y*destW + (x-1))*4 + c]
        const r = src[(y*destW + (x+1))*4 + c]
        dest[idx + c] = Math.round(center + (5*center - t - b - l - r - center) * 0.6)
      }
      dest[idx + 3] = src[idx + 3]
    }
    if (y % 100 === 0) await yieldToMainThread()
  }
  imageData.data.set(dest)
  ctx.putImageData(imageData, 0, 0)

  return canvas.toDataURL("image/png")
}

/**
 * AI 高清化入口
 * scale = 1: 不改变尺寸，只做画质增强（锐化 + 对比度）
 * scale > 1: 放大 + 锐化 + 对比度
 */
export async function aiEnhance(img, scale) {
  // scale = 1: 只增强，不放大
  if (scale === 1) {
    const result = await enhanceAtOriginalResolution(img)
    return result
  }

  // scale = 8：分解为两次 4x
  if (scale === 8) {
    const step1 = await aiEnhance(img, 4)
    const img2 = new Image()
    await new Promise((resolve, reject) => {
      img2.onload = resolve; img2.onerror = reject; img2.src = step1
    })
    return aiEnhance(img2, 2)
  }

  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height

  // 分步高质量放大 + 锐化
  const baseResult = await enhanceWithCanvas(img, scale)

  // 尝试用 TF.js 做额外增强
  let finalDataUrl = baseResult
  try {
    await ensureBackend()
    if (backendReady && tf.getBackend()) {
      const w = srcW * scale
      const h = srcH * scale
      finalDataUrl = await tfEnhance(baseResult, w, h)
    }
  } catch {
    // 静默降级
  }

  // 对比度增强
  const finalImg = new Image()
  await new Promise((resolve, reject) => {
    finalImg.onload = resolve; finalImg.onerror = reject; finalImg.src = finalDataUrl
  })
  const fw = finalImg.naturalWidth || finalImg.width
  const fh = finalImg.naturalHeight || finalImg.height
  const canvas = document.createElement("canvas")
  canvas.width = fw; canvas.height = fh
  const ctx = canvas.getContext("2d")
  ctx.drawImage(finalImg, 0, 0)
  enhanceContrast(ctx, fw, fh)

  return canvas.toDataURL("image/png")
}

async function tfEnhance(dataUrl, w, h) {
  await yieldToMainThread()
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve; img.onerror = reject; img.src = dataUrl
  })

  const trainSize = 256
  const scale = Math.min(1, trainSize / Math.max(w, h))
  const tw = Math.round(w * scale); const th = Math.round(h * scale)
  const tempCanvas = document.createElement("canvas")
  tempCanvas.width = tw; tempCanvas.height = th
  const tempCtx = tempCanvas.getContext("2d")
  tempCtx.drawImage(img, 0, 0, tw, th)
  const imgTensor = tf.browser.fromPixels(tempCanvas).toFloat().div(255)

  if (model) model.dispose()
  model = buildModel()
  const { lr, hr } = generateTrainingPair(imgTensor, 2)
  model.compile({ optimizer: tf.train.adam(0.001), loss: "meanSquaredError" })
  const xBatch = lr.expandDims(0); const yBatch = hr.expandDims(0)
  await model.fit(xBatch, yBatch, { epochs: 2, batchSize: 1, verbose: 0 })
  tf.dispose([lr, hr, xBatch, yBatch, imgTensor])
  await yieldToMainThread()

  const fullTensor = tf.browser.fromPixels(img).toFloat().div(255)
  const [fh, fw_] = fullTensor.shape.slice(0, 2)
  const tileSize = 256
  const result = tf.buffer([fh, fw_, 3])
  for (let y = 0; y < fh; y += tileSize) {
    for (let x = 0; x < fw_; x += tileSize) {
      const ye = Math.min(fh, y + tileSize); const xe = Math.min(fw_, x + tileSize)
      const patch = fullTensor.slice([y, x, 0], [ye - y, xe - x, 3])
      const batched = patch.expandDims(0)
      const enhanced = model.predict(batched).squeeze(0).clipByValue(0, 1)
      const data = await enhanced.data()
      let idx = 0
      for (let py = y; py < ye; py++) {
        for (let px = x; px < xe; px++) {
          result.set(data[idx], py, px, 0); result.set(data[idx + 1], py, px, 1)
          result.set(data[idx + 2], py, px, 2); idx += 3
        }
      }
      tf.dispose([patch, batched, enhanced])
    }
    await yieldToMainThread()
  }
  tf.dispose([fullTensor])
  const outTensor = tf.tidy(() => result.toTensor().mul(255).cast("int32"))
  const outCanvas = document.createElement("canvas")
  outCanvas.width = fw_; outCanvas.height = fh
  await tf.browser.toPixels(outTensor, outCanvas)
  tf.dispose([outTensor])
  return outCanvas.toDataURL("image/png")
}

function enhanceContrast(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  let min = [255,255,255], max = [0,0,0]
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      if (data[i+c] < min[c]) min[c] = data[i+c]
      if (data[i+c] > max[c]) max[c] = data[i+c]
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const range = max[c] - min[c]
      if (range > 0) data[i + c] = Math.round(((data[i + c] - min[c]) / range) * 255)
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

export function disposeModel() {
  if (model) { model.dispose(); model = null }
}
