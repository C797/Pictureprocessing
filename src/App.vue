<template>
  <Aurora
    :color-stops="['#3A29FF', '#FF94B4', '#FF3232']"
    :blend="0.3"
    :amplitude="0.8"
    :speed="0.6"
  />
  <div class="app">
    <header class="app-header">
      <div class="header-badge">v2.0</div>
      <h1>Image Forge</h1>
      <p class="subtitle">AI 高清化 · 分辨率放大 · 图片压缩 · 去水印</p>
    </header>

    <main class="app-main">
      <ImageUploader @files-selected="onFilesSelected" />

      <transition name="list-fade">
        <ImageList
          v-if="imageItems.length > 0"
          :items="imageItems"
          :processing="processing"
          :mode="mode"
          :scale="selectedScale"
          :quality="compressQuality"
          :processingText="processingText"
          @update-mode="onModeChange"
          @update-scale="onScaleChange"
          @update-quality="onQualityChange"
          @update-watermark-rect="onUpdateWatermarkRect"
          @process="onProcessAll"
          @download="onDownloadSingle"
          @download-all="onDownloadAll"
          @remove="onRemoveItem"
          @clear="onClearAll"
        />
      </transition>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Aurora from './components/Aurora.vue'
import ImageUploader from './components/ImageUploader.vue'
import ImageList from './components/ImageList.vue'
import {
  fileToImage,
  upscaleImage,
  compressImage,
  dataURLToBlob,
  downloadBlob,
  estimateDataURLSize
} from './utils/imageProcessor.js'
import { inpaintRegion } from './utils/watermarkRemover.js'

const imageItems = ref([])
const processing = ref(false)
const processingText = ref('处理中...')
const mode = ref('upscale')
const selectedScale = ref(2)
const compressQuality = ref(30)

function onFilesSelected(files) {
  for (const file of files) {
    if (!imageItems.value.some((item) => item.name === file.name)) {
      imageItems.value.push({
        id: Date.now() + Math.random(),
        file,
        name: file.name,
        url: URL.createObjectURL(file),
        originalWidth: 0,
        originalHeight: 0,
        originalSize: file.size,
        processedUrl: null,
        processedWidth: 0,
        processedHeight: 0,
        processedSize: 0,
        error: null,
        watermarkRect: null
      })
    }
  }
}

function onModeChange(m) { mode.value = m }
function onScaleChange(scale) { selectedScale.value = scale }
function onQualityChange(q) { compressQuality.value = q }

function onUpdateWatermarkRect({ id, rect }) {
  const item = imageItems.value.find((i) => i.id === id)
  if (item) item.watermarkRect = rect
}

async function onProcessAll() {
  processing.value = true

  let aiEnhance = null
  if (mode.value === 'ai-hd') {
    processingText.value = '加载 AI 模型...'
    const tfModule = await import('./utils/tfUpscaler.js')
    aiEnhance = tfModule.aiEnhance
  }

  for (const item of imageItems.value) {
    item.error = null
    item.processedUrl = null
    item.processedSize = 0
    try {
      const img = await fileToImage(item.file)
      item.originalWidth = img.naturalWidth || img.width
      item.originalHeight = img.naturalHeight || img.height

      if (mode.value === 'ai-hd') {
        processingText.value = 'AI 高清化中...'
        const dataUrl = await aiEnhance(img, 1)
        item.processedUrl = dataUrl
        item.processedWidth = item.originalWidth
        item.processedHeight = item.originalHeight
        item.processedSize = estimateDataURLSize(dataUrl)
      } else if (mode.value === 'upscale') {
        processingText.value = '放大中...'
        const scale = selectedScale.value
        const dataUrl = await upscaleImage(img, scale)
        item.processedUrl = dataUrl
        item.processedWidth = item.originalWidth * scale
        item.processedHeight = item.originalHeight * scale
        item.processedSize = estimateDataURLSize(dataUrl)
      } else if (mode.value === 'dewatermark') {
        processingText.value = '去水印中...'
        if (!item.watermarkRect) {
          item.error = '请先选择水印区域'
          continue
        }
        const dataUrl = await removeWatermark(item.url, item.watermarkRect)
        item.processedUrl = dataUrl
        item.processedWidth = item.originalWidth
        item.processedHeight = item.originalHeight
        item.processedSize = estimateDataURLSize(dataUrl)
      } else {
        processingText.value = '压缩中...'
        const dataUrl = await compressImage(img, compressQuality.value)
        item.processedUrl = dataUrl
        item.processedWidth = item.originalWidth
        item.processedHeight = item.originalHeight
        item.processedSize = estimateDataURLSize(dataUrl)
      }
    } catch (err) {
      item.error = `处理失败: ${err.message}`
    }
  }

  processing.value = false
}

async function removeWatermark(imageUrl, rect) {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = imageUrl
  })

  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)

  // Scale normalized coordinates to actual image size
  const actualRect = {
    x: Math.round(rect.x * w),
    y: Math.round(rect.y * h),
    w: Math.round(rect.w * w),
    h: Math.round(rect.h * h)
  }

  inpaintRegion(canvas, actualRect)

  return canvas.toDataURL('image/png')
}

function onDownloadSingle(item) {
  if (!item.processedUrl) return
  const blob = dataURLToBlob(item.processedUrl)
  const baseName = item.name.replace(/\.[^.]+$/, '')
  if (mode.value === 'ai-hd') {
    downloadBlob(blob, `${baseName}_ai-hd.png`)
  } else if (mode.value === 'upscale') {
    const ext = item.name.match(/\.(png|jpg|jpeg|webp|bmp|gif)$/i)?.[1] || 'png'
    downloadBlob(blob, `${baseName}_${selectedScale.value}x.${ext}`)
  } else if (mode.value === 'dewatermark') {
    downloadBlob(blob, `${baseName}_no_watermark.png`)
  } else {
    downloadBlob(blob, `${baseName}_compressed.jpg`)
  }
}

function onDownloadAll() {
  for (const item of imageItems.value) {
    if (item.processedUrl) onDownloadSingle(item)
  }
}

function onRemoveItem(id) {
  const item = imageItems.value.find((i) => i.id === id)
  if (item) URL.revokeObjectURL(item.url)
  imageItems.value = imageItems.value.filter((i) => i.id !== id)
}

function onClearAll() {
  for (const item of imageItems.value) {
    URL.revokeObjectURL(item.url)
  }
  imageItems.value = []
}
</script>

<style lang="scss">
*,
*::before,
*::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --primary-subtle: rgba(99, 102, 241, 0.12);
  --ai: #8b5cf6;
  --ai-hover: #7c3aed;
  --ai-glow: rgba(139, 92, 246, 0.2);
  --ai-subtle: rgba(139, 92, 246, 0.12);
  --compress: #06b6d4;
  --compress-hover: #0891b2;
  --dewater: #10b981;
  --dewater-hover: #059669;
  --dewater-glow: rgba(16, 185, 129, 0.2);
  --dewater-subtle: rgba(16, 185, 129, 0.12);
  --bg: #07051a;
  --bg-card: rgba(15, 12, 41, 0.7);
  --bg-card-hover: rgba(25, 20, 55, 0.8);
  --bg-glass: rgba(255, 255, 255, 0.03);
  --text: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border: rgba(148, 163, 184, 0.1);
  --border-light: rgba(148, 163, 184, 0.18);
  --success: #22c55e;
  --success-bg: rgba(34, 197, 94, 0.1);
  --danger: #ef4444;
  --danger-bg: rgba(239, 68, 68, 0.1);
  --radius: 14px;
  --radius-sm: 8px;
  --radius-xl: 20px;
  --shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
  --shadow-sm: 0 2px 12px rgba(0, 0, 0, 0.25);
  --transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

html { font-size: 16px; scroll-behavior: smooth; }

body {
  background: #07051a;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.app { position: relative; z-index: 1; max-width: 1000px; margin: 0 auto; padding: 40px 24px 80px; }

.app-header {
  text-align: center; margin-bottom: 48px;
  .header-badge {
    display: inline-block; padding: 3px 12px; border-radius: 20px;
    background: var(--primary-subtle); border: 1px solid rgba(99, 102, 241, 0.25);
    color: var(--primary); font-size: 0.7rem; font-weight: 600;
    letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px;
  }
  h1 {
    font-size: 3rem; font-weight: 800; letter-spacing: -0.02em;
    background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 40%, #c084fc 100%);
    background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }
  .subtitle { color: var(--text-muted); font-size: 1.05rem; letter-spacing: 0.3px; }
}

.list-fade-enter-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.list-fade-enter-from { opacity: 0; transform: translateY(16px); }

@media (max-width: 640px) { .app { padding: 24px 16px 60px; } .app-header h1 { font-size: 2rem; } }
</style>

