/**
 * 水印去除工具 - 改进版
 * 基于 FMM (Fast Marching Method) 的图像修复算法
 * 使用双向加权采样 + 渐进式边界推进
 */

/**
 * 对 Canvas 中指定矩形区域进行修复
 */
export function inpaintRegion(canvas, rect) {
  const ctx = canvas.getContext('2d')
  const { x, y, w, h } = rect
  const iw = canvas.width
  const ih = canvas.height

  const rx = Math.max(0, Math.min(Math.round(x), iw - 1))
  const ry = Math.max(0, Math.min(Math.round(y), ih - 1))
  const rw = Math.min(Math.round(w), iw - rx)
  const rh = Math.min(Math.round(h), ih - ry)
  if (rw <= 4 || rh <= 4) return

  const imageData = ctx.getImageData(0, 0, iw, ih)
  const data = imageData.data

  // 1. 构建掩码
  const mask = new Uint8Array(iw * ih)
  for (let py = ry; py < ry + rh; py++)
    for (let px = rx; px < rx + rw; px++)
      mask[py * iw + px] = 1

  // 保存原始掩码备份（用于羽化）
  const origMask = new Uint8Array(mask)

  // 2. 计算距离图 (从边缘到中心)
  const dist = computeDistanceMap(mask, iw, ih, rx, ry, rw, rh)

  // 3. 分层填充：从边缘向内逐层推进
  const maxDist = rh > rw ? rh : rw
  for (let d = 1; d <= maxDist; d += 2) {
    fillLayer(data, mask, dist, iw, ih, rx, ry, rw, rh, d)
  }

  // 4. 边界羽化：在选区边界做渐变混合
  featherBoundary(data, iw, ih, rx, ry, rw, rh, origMask)

  // 5. 轻量去噪
  edgePreserveBlur(data, iw, ih, rx, ry, rw, rh)

  ctx.putImageData(imageData, 0, 0)
}

/**
 * 计算距离图：每个像素到最近边界像素的近似距离
 */
function computeDistanceMap(mask, iw, ih, rx, ry, rw, rh) {
  const dist = new Float32Array(iw * ih)
  const INF = 1e9

  for (let py = ry; py < ry + rh; py++) {
    for (let px = rx; px < rx + rw; px++) {
      if (mask[py * iw + px] === 0) { dist[py * iw + px] = 0; continue }
      // 到最近边界的 Chebyshev 距离
      const dx = Math.min(px - rx, (rx + rw - 1) - px)
      const dy = Math.min(py - ry, (ry + rh - 1) - py)
      dist[py * iw + px] = Math.min(dx, dy) + 1
    }
  }
  return dist
}

/**
 * 填充指定距离层内的所有像素
 */
function fillLayer(data, mask, dist, iw, ih, rx, ry, rw, rh, layerDist) {
  // 收集当前距离层的像素
  const pixels = []
  for (let py = ry; py < ry + rh; py++) {
    for (let px = rx; px < rx + rw; px++) {
      const d = dist[py * iw + px]
      if (d > 0 && d >= layerDist - 1 && d <= layerDist) {
        pixels.push({ px, py })
      }
    }
  }

  if (pixels.length === 0) return

  // 对每个像素做采样填充
  for (const { px, py } of pixels) {
    if (mask[py * iw + px] === 0) continue
    sampleFill(data, mask, iw, ih, px, py, rx, ry, rw, rh)
    mask[py * iw + px] = 0
  }
}

/**
 * 用周围已知像素加权填充目标像素（双向权重）
 */
function sampleFill(data, mask, iw, ih, px, py, rx, ry, rw, rh) {
  const idx = py * iw + px
  const searchRadius = 3 + Math.floor(Math.sqrt(rw * rh) / 4)

  let totalWeight = 0
  let rSum = 0, gSum = 0, bSum = 0

  // 在环形区域按网格采样
  for (let angle = 0; angle < 360; angle += 30) {
    const rad = angle * Math.PI / 180
    const dist = 2 + (angle % 60) / 60 * searchRadius

    const sx = Math.round(px + Math.cos(rad) * dist)
    const sy = Math.round(py + Math.sin(rad) * dist)

    if (sx < 0 || sx >= iw || sy < 0 || sy >= ih) continue
    const sidx = sy * iw + sx
    if (mask[sidx] === 1) continue

    // 空间距离权重 (高斯)
    const d = Math.sqrt((sx - px) ** 2 + (sy - py) ** 2)
    const spatialWeight = Math.exp(-d * d / (searchRadius * searchRadius * 0.5))

    // 颜色相似度权重
    const dr = data[sidx * 4] - data[idx * 4]
    const dg = data[sidx * 4 + 1] - data[idx * 4 + 1]
    const db = data[sidx * 4 + 2] - data[idx * 4 + 2]
    const colorDist = Math.sqrt(dr * dr + dg * dg + db * db)
    const colorWeight = Math.exp(-colorDist / 30)

    const weight = spatialWeight * colorWeight

    totalWeight += weight
    rSum += data[sidx * 4] * weight
    gSum += data[sidx * 4 + 1] * weight
    bSum += data[sidx * 4 + 2] * weight
  }

  if (totalWeight > 0) {
    data[idx * 4] = rSum / totalWeight
    data[idx * 4 + 1] = gSum / totalWeight
    data[idx * 4 + 2] = bSum / totalWeight
  }
}

/**
 * 选区边界羽化：在修复区域和原始图像之间渐变过渡
 */
function featherBoundary(data, iw, ih, rx, ry, rw, rh, mask) {
  const featherWidth = 3
  const copy = new Uint8ClampedArray(data)

  for (let py = ry; py < ry + rh; py++) {
    for (let px = rx; px < rx + rw; px++) {
      const idx = py * iw + px
      if (mask[idx] === 0) continue

      // 检查是否靠近边界
      let minEdgeDist = Infinity
      for (let dy = -featherWidth; dy <= featherWidth; dy++) {
        for (let dx = -featherWidth; dx <= featherWidth; dx++) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || nx >= iw || ny < 0 || ny >= ih) continue
          const nidx = ny * iw + nx
          if (mask[nidx] === 0) {
            const ed = Math.sqrt(dx * dx + dy * dy)
            if (ed < minEdgeDist) minEdgeDist = ed
          }
        }
      }

      if (minEdgeDist <= featherWidth) {
        // 在修复结果和原始图像之间线性混合
        const t = minEdgeDist / featherWidth
        data[idx * 4]     = copy[idx * 4]     * t + data[idx * 4]     * (1 - t)
        data[idx * 4 + 1] = copy[idx * 4 + 1] * t + data[idx * 4 + 1] * (1 - t)
        data[idx * 4 + 2] = copy[idx * 4 + 2] * t + data[idx * 4 + 2] * (1 - t)
      }
    }
  }
}

/**
 * 边缘保留模糊：对修复区域做平滑但不模糊边缘
 */
function edgePreserveBlur(data, iw, ih, rx, ry, rw, rh) {
  const copy = new Uint8ClampedArray(data)

  for (let py = ry; py < ry + rh; py++) {
    for (let px = rx; px < rx + rw; px++) {
      let rSum = 0, gSum = 0, bSum = 0, totalW = 0

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const sx = px + dx
          const sy = py + dy
          if (sx < 0 || sx >= iw || sy < 0 || sy >= ih) continue
          const sidx = (sy * iw + sx) * 4

          // 颜色相似度权重 (边缘保留)
          const dr = copy[sidx] - copy[(py * iw + px) * 4]
          const dg = copy[sidx + 1] - copy[(py * iw + px) * 4 + 1]
          const db = copy[sidx + 2] - copy[(py * iw + px) * 4 + 2]
          const cdist = Math.sqrt(dr * dr + dg * dg + db * db)
          const w = Math.exp(-cdist / 20)

          rSum += copy[sidx] * w
          gSum += copy[sidx + 1] * w
          bSum += copy[sidx + 2] * w
          totalW += w
        }
      }

      if (totalW > 0) {
        const didx = (py * iw + px) * 4
        data[didx] = rSum / totalW
        data[didx + 1] = gSum / totalW
        data[didx + 2] = bSum / totalW
      }
    }
  }
}



