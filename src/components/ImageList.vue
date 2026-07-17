<template>
  <div class="list-container">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="file-count">{{ items.length }} 张图片</span>
      </div>
      <div class="toolbar-right">
        <!-- Mode switcher -->
        <div class="mode-group">
          <button
            v-for="m in modes"
            :key="m.key"
            :class="['mode-btn', { active: mode === m.key }]"
            @click="$emit('update-mode', m.key)"
          >
            <span v-html="m.icon"></span>
            {{ m.label }}
          </button>
        </div>

        <!-- AI HD hint -->
        <div v-if="mode === 'ai-hd'" class="param-pill">
          <span>📺 保持原图分辨率</span>
        </div>

        <!-- Scale selector -->
        <div v-if="mode === 'upscale'" class="param-group">
          <span class="param-label">倍数</span>
          <button
            v-for="s in [2, 4, 8]"
            :key="s"
            :class="['param-btn', { active: scale === s }]"
            @click="$emit('update-scale', s)"
          >{{ s }}x</button>
        </div>

        <!-- Quality slider -->
        <div v-if="mode === 'compress'" class="param-group">
          <span class="param-label">质量</span>
          <div class="slider-wrap">
            <input
              type="range"
              min="1"
              max="100"
              :value="quality"
              class="slider"
              @input="onQualityInput"
            />
            <span class="slider-value">{{ quality }}%</span>
          </div>
        </div>

        <!-- Dewatermark hint -->
        <div v-if="mode === 'dewatermark'" class="param-pill" style="background:var(--dewater-subtle);border-color:rgba(16,185,129,0.2);color:var(--dewater)">
          <span>✏️ 点击下方图片框选水印区域</span>
        </div>

        <!-- Actions -->
        <button class="btn" :class="actionBtnClass" :disabled="processing" @click="$emit('process')">
          <span v-if="processing" class="btn-spinner"></span>
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>选择水印区域</h3>
          <p>在图片上拖拽框选要去除的水印区域</p>
        </div>
        <div class="modal-image-wrap" ref="modalImgWrapRef">
          <img v-if="modalItem" :src="modalItem.url" alt="watermark selection" />
          <canvas v-if="showModal" ref="modalCanvasRef" class="modal-canvas"
            @mousedown.prevent="onModalMouseDown($event)"
            @mousemove.prevent="onModalMouseMove($event)"
            @mouseup.prevent="onModalMouseUp"
            @mouseleave="onModalMouseUp"></canvas>
          <div v-if="modalRect" class="modal-rect" :style="modalRectStyle"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="closeModal">取消</button>
          <button class="btn btn-dewater" :disabled="!modalRect" @click="confirmModal">确认去除水印</button>
        </div>
      </div>
      <button class="modal-close" @click="closeModal">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>选择水印区域</h3>
          <p>在图片上拖拽框选要去除的水印区域</p>
        </div>
        <div class="modal-image-wrap" ref="modalImgWrapRef">
          <img v-if="modalItem" :src="modalItem.url" alt="watermark selection" />
          <canvas v-if="showModal" ref="modalCanvasRef" class="modal-canvas"
            @mousedown.prevent="onModalMouseDown($event)"
            @mousemove.prevent="onModalMouseMove($event)"
            @mouseup.prevent="onModalMouseUp"
            @mouseleave="onModalMouseUp"></canvas>
          <div v-if="modalRect" class="modal-rect" :style="modalRectStyle"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="closeModal">取消</button>
          <button class="btn btn-dewater" :disabled="!modalRect" @click="confirmModal">确认去除水印</button>
        </div>
      </div>
      <button class="modal-close" @click="closeModal">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
          <template v-else>{{ actionLabel }}</template>
        </button>

        <button class="btn btn-ghost" :disabled="!hasProcessed" @click="$emit('download-all')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="21 15 21 21 3 21 3 15" /><line x1="12" y1="3" x2="12" y2="15" /><polyline points="7 10 12 15 17 10" /></svg>
          全部下载
        </button>

        <button v-if="items.length > 0" class="btn btn-ghost btn-danger-ghost" @click="$emit('clear')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>
    </div>

    <!-- Processing progress -->
    <div v-if="processing" class="progress-bar">
      <div class="progress-fill"></div>
    </div>

    <!-- Cards -->
    <transition-group name="card" tag="div" class="card-grid">
      <div v-for="item in items" :key="item.id" class="card">
        <div class="card-header">
          <div class="card-title">
            <div class="file-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            </div>
            <span class="file-name" :title="item.name">{{ item.name }}</span>
            <span class="file-size">{{ formatBytes(item.originalSize) }}</span>
          </div>
          <button class="btn-icon" title="移除" @click="$emit('remove', item.id)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div class="card-body">
          <div class="preview-col">
            <span class="preview-label">原图</span>
            <div class="preview-box" @click="clickPreviewForWatermark(item)">
              <img :src="item.url" :alt="item.name" />
            </div>
            <div class="preview-meta" v-if="item.originalWidth">
              <span class="meta-dot"></span>
              {{ item.originalWidth }}x{{ item.originalHeight }}
            </div>
          </div>

          <div class="preview-divider">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </div>

          <div class="preview-col">
            <span class="preview-label" :class="mode === 'ai-hd' ? 'label-ai' : 'label-primary'">
              {{ resultLabel }}
              <span v-if="mode === 'ai-hd' && item.processedUrl" class="ai-chip">AI</span>
              <span v-if="mode === 'compress' && item.processedUrl && item.processedSize < item.originalSize" class="success-chip">
                -{{ compressPercent(item.originalSize, item.processedSize) }}%
              </span>
            </span>
            <div class="preview-box" :class="{ 'preview-ai-glow': mode === 'ai-hd' && item.processedUrl }">
              <template v-if="item.processedUrl">
                <img :src="item.processedUrl" :alt="item.name + ' processed'" />
              </template>
              <template v-else-if="item.error">
                <div class="error-state">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                  <span>{{ item.error }}</span>
                </div>
              </template>
              <template v-else>
                <div class="placeholder-state">
                  <div class="pulse-box"></div>
                  <span>{{ processing ? processingText : '等待处理' }}</span>
                </div>
              </template>
            </div>
            <div class="preview-meta" v-if="item.processedWidth">
              <span class="meta-dot" :class="mode === 'ai-hd' ? 'dot-ai' : (mode === 'compress' ? 'dot-compress' : (mode === 'dewatermark' ? 'dot-dewater' : 'dot-primary'))"></span>
              {{ item.processedWidth }}x{{ item.processedHeight }}
              <span class="meta-sep">·</span>
              {{ formatBytes(item.processedSize) }}
            </div>
          </div>
        </div>

        <div class="card-footer" v-if="item.processedUrl">
          <div class="footer-left">
            <span class="success-tag">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              处理完成
            </span>
          </div>
          <button class="btn btn-sm" :class="mode === 'ai-hd' ? 'btn-ai' : (mode === 'dewatermark' ? 'btn-dewater' : 'btn-primary')" @click="$emit('download', item)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="21 15 21 21 3 21 3 15" /><line x1="12" y1="3" x2="12" y2="15" /><polyline points="7 10 12 15 17 10" /></svg>
            下载
          </button>
        </div>
      </div>
    </transition-group>
  </div>

  <!-- Watermark modal -->
  <Teleport to="body">
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <button class="modal-close" @click="closeModal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div class="modal-header">
          <h3>选择水印区域</h3>
          <p>在图片上拖拽框选要去除的水印区域</p>
        </div>
        <div class="modal-image-wrap" ref="modalImgWrapRef">
          <img v-if="modalItem" :src="modalItem.url" alt="watermark selection" />
          <canvas v-if="showModal" ref="modalCanvasRef" class="modal-canvas"
            @mousedown.prevent="onModalMouseDown($event)"
            @mousemove.prevent="onModalMouseMove($event)"
            @mouseup.prevent="onModalMouseUp"
            @mouseleave="onModalMouseUp"></canvas>
          <div v-if="modalRect" class="modal-rect" :style="modalRectStyle"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="closeModal">取消</button>
          <button class="btn btn-dewater" :disabled="!modalRect" @click="confirmModal">确认去除水印</button>
        </div>
      </div>
    </div>
  </Teleport>

</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  items: { type: Array, required: true },
  processing: { type: Boolean, default: false },
  processingText: { type: String, default: '处理中...' },
  mode: { type: String, default: 'upscale' },
  scale: { type: Number, default: 2 },
  quality: { type: Number, default: 30 }
})

const emit = defineEmits([
  'update-mode', 'update-scale', 'update-quality',
  'process', 'download', 'download-all', 'remove', 'clear',
  'update-watermark-rect'
])

// Watermark modal state
const showModal = ref(false)
const modalItem = ref(null)
const modalRect = ref(null)
const modalDrawing = ref(false)
const modalStart = ref({ x: 0, y: 0 })
const modalCurrent = ref({ x: 0, y: 0 })
const modalImgWrapRef = ref(null)
const modalCanvasRef = ref(null)

const modes = [
  { key: 'ai-hd', icon: '&#129302;', label: 'AI 高清' },
  { key: 'upscale', icon: '&#8599;', label: '放大' },
  { key: 'compress', icon: '&#9660;', label: '压缩' },
  { key: 'dewatermark', icon: '&#128200;', label: '去水印' }
]

function onQualityInput(e) {
  emit('update-quality', Number(e.target.value))
}

const hasProcessed = computed(() => props.items.some((i) => !!i.processedUrl))

const actionBtnClass = computed(() => {
  if (props.mode === 'ai-hd') return 'btn-ai'
  if (props.mode === 'dewatermark') return 'btn-dewater'
  return 'btn-primary'
})

const actionLabel = computed(() => {
  if (props.mode === 'ai-hd') return 'AI 高清处理'
  if (props.mode === 'compress') return '开始压缩'
  if (props.mode === 'dewatermark') return '开始去水印'
  return '开始处理'
})

const resultLabel = computed(() => {
  if (props.mode === 'ai-hd') return 'AI 高清'
  if (props.mode === 'compress') return '压缩后'
  if (props.mode === 'dewatermark') return '去水印'
  return '处理后'
})

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function compressPercent(orig, proc) {
  const pct = ((1 - proc / orig) * 100).toFixed(0)
  return pct
}


function clickPreviewForWatermark(item) {
  if (props.mode !== 'dewatermark' || !item) return
  modalItem.value = item
  modalRect.value = null
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  modalItem.value = null
  modalRect.value = null
}

function onModalMouseDown(e) {
  modalDrawing.value = true
  const wrap = modalImgWrapRef.value
  if (!wrap) return
  const br = wrap.getBoundingClientRect()
  modalStart.value = { x: e.clientX - br.left, y: e.clientY - br.top }
  modalCurrent.value = { x: modalStart.value.x, y: modalStart.value.y }
}

function onModalMouseMove(e) {
  if (!modalDrawing.value) return
  const wrap = modalImgWrapRef.value
  if (!wrap) return
  const br = wrap.getBoundingClientRect()
  modalCurrent.value = { x: e.clientX - br.left, y: e.clientY - br.top }

  const canvas = modalCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  canvas.width = wrap.offsetWidth
  canvas.height = wrap.offsetHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const x = Math.min(modalStart.value.x, modalCurrent.value.x)
  const y = Math.min(modalStart.value.y, modalCurrent.value.y)
  const w = Math.abs(modalCurrent.value.x - modalStart.value.x)
  const h = Math.abs(modalCurrent.value.y - modalStart.value.y)

  if (w > 2 && h > 2) {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#10b981'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
    modalRect.value = { x, y, w, h }
  }
}


function confirmModal() {
  if (!modalRect.value || !modalItem.value) return
  const wrap = modalImgWrapRef.value
  if (!wrap) return
  const wrapW = wrap.offsetWidth
  const wrapH = wrap.offsetHeight
  if (wrapW === 0 || wrapH === 0) return

  // 获取实际图片尺寸 (考虑 object-fit: contain)
  const img = wrap.querySelector('img')
  if (!img) return
  const natW = img.naturalWidth
  const natH = img.naturalHeight
  if (natW === 0 || natH === 0) return

  // 计算图片在 wrap 中的实际显示区域
  const scale = Math.min(wrapW / natW, wrapH / natH)
  const dispW = natW * scale
  const dispH = natH * scale
  const offX = (wrapW - dispW) / 2
  const offY = (wrapH - dispH) / 2

  // 将 canvas 坐标转换为图片坐标
  const relX = modalRect.value.x - offX
  const relY = modalRect.value.y - offY
  const relW = modalRect.value.w
  const relH = modalRect.value.h

  // 裁剪到图片范围内
  const cropX = Math.max(0, relX)
  const cropY = Math.max(0, relY)
  const cropW = Math.min(relW, dispW - cropX)
  const cropH = Math.min(relH, dispH - cropY)

  if (cropW < 2 || cropH < 2) return

  // 归一化到 0-1 (相对于图片实际显示区域)
  const norm = {
    x: cropX / dispW,
    y: cropY / dispH,
    w: cropW / dispW,
    h: cropH / dispH
  }

  emit('update-watermark-rect', { id: modalItem.value.id, rect: norm })

  const canvas = modalCanvasRef.value
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  closeModal()
}
function onModalMouseUp() {
  if (!modalDrawing.value) return
  modalDrawing.value = false

  const x = Math.min(modalStart.value.x, modalCurrent.value.x)
  const y = Math.min(modalStart.value.y, modalCurrent.value.y)
  const w = Math.abs(modalCurrent.value.x - modalStart.value.x)
  const h = Math.abs(modalCurrent.value.y - modalStart.value.y)

  if (w < 5 || h < 5) {
    modalRect.value = null
    const canvas = modalCanvasRef.value
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }
}

const modalRectStyle = computed(() => {
  if (!modalRect.value) return {}
  return {
    left: modalRect.value.x + 'px',
    top: modalRect.value.y + 'px',
    width: modalRect.value.w + 'px',
    height: modalRect.value.h + 'px'
  }
})
</script>

<style lang="scss" scoped>
.list-container {
  margin-top: 36px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 20px;
}
.toolbar-left {
  .file-count { font-size: 0.8rem; color: var(--text-muted); font-weight: 500; }
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-group {
  display: flex;
  background: rgba(0,0,0,0.2);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
  .mode-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all var(--transition);
    white-space: nowrap;
    &:hover { color: var(--text-secondary); }
    &.active { background: var(--primary); color: #fff; font-weight: 600; }
    &:first-child.active { background: var(--ai); }
  }
}

.param-pill {
  padding: 6px 14px;
  background: var(--ai-subtle);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 10px;
  font-size: 0.8rem;
  color: var(--ai);
  white-space: nowrap;
}

.param-group {
  display: flex;
  align-items: center;
  gap: 6px;
  .param-label { font-size: 0.75rem; color: var(--text-muted); }
  .param-btn {
    padding: 5px 11px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all var(--transition);
    &:hover { border-color: var(--primary); color: var(--text); }
    &.active { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 600; }
  }
}

.slider-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  .slider-value { min-width: 36px; font-size: 0.8rem; font-weight: 600; color: var(--compress); font-variant-numeric: tabular-nums; }
  .slider {
    -webkit-appearance: none; appearance: none; width: 100px; height: 4px; border-radius: 2px; background: var(--border); outline: none;
    &::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--compress); cursor: pointer; border: 2px solid var(--bg-card); transition: transform 0.15s; }
    &::-webkit-slider-thumb:hover { transform: scale(1.25); }
    &::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--compress); cursor: pointer; border: 2px solid var(--bg-card); }
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: 10px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &-primary { background: var(--primary); color: #fff; &:hover:not(:disabled) { background: var(--primary-hover); } }
  &-ai { background: var(--ai); color: #fff; &:hover:not(:disabled) { background: var(--ai-hover); } }
  &-dewater { background: var(--dewater); color: #fff; &:hover:not(:disabled) { background: var(--dewater-hover); } }
}
.btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); &:hover:not(:disabled) { border-color: var(--border-light); color: var(--text); } }
.btn-danger-ghost { padding: 7px 10px; &:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); } }
.btn-sm { padding: 6px 14px; font-size: 0.78rem; border-radius: 8px; }
.btn-icon { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; transition: all var(--transition); &:hover { color: var(--danger); background: var(--danger-bg); } }
.btn-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.progress-bar { height: 2px; background: var(--border); border-radius: 2px; margin-bottom: 20px; overflow: hidden; }
.progress-fill { height: 100%; width: 30%; background: linear-gradient(90deg, var(--primary), var(--ai)); border-radius: 2px; animation: progressSlide 1.2s ease-in-out infinite; }
@keyframes progressSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }

.card-grid { display: flex; flex-direction: column; gap: 14px; }
.card {
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: all var(--transition);
  &:hover { border-color: var(--border-light); box-shadow: var(--shadow); }
}

.card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.card-title { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.file-icon { flex-shrink: 0; width: 28px; height: 28px; border-radius: 8px; background: var(--bg-glass); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.file-name { font-size: 0.82rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.file-size { font-size: 0.72rem; color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

.card-body { display: flex; align-items: center; padding: 16px; gap: 12px; }
.preview-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }

.preview-label {
  font-size: 0.7rem; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.8px;
  display: flex; align-items: center; gap: 6px;
  &.label-primary { color: var(--primary); }
  &.label-ai { color: var(--ai); }
}

.ai-chip { font-size: 0.55rem; font-weight: 700; background: var(--ai); color: #fff; padding: 1px 6px; border-radius: 4px; letter-spacing: 0.3px; }
.success-chip { font-size: 0.55rem; font-weight: 700; background: var(--success-bg); color: var(--success); padding: 1px 6px; border-radius: 4px; letter-spacing: 0.3px; }

.preview-box {
  position: relative;
  width: 100%;
  max-width: 280px;
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
}

.preview-ai-glow { box-shadow: 0 0 20px var(--ai-glow); }
.preview-divider { flex-shrink: 0; display: flex; align-items: center; color: var(--text-muted); opacity: 0.6; }
.preview-meta { font-size: 0.72rem; color: var(--text-muted); font-variant-numeric: tabular-nums; display: flex; align-items: center; gap: 5px; }
.meta-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; &-primary { background: var(--primary); } &-ai { background: var(--ai); } &-compress { background: var(--compress); } &-dewater { background: var(--dewater); } }
.meta-sep { opacity: 0.4; }

.placeholder-state { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-muted); font-size: 0.75rem; .pulse-box { width: 40px; height: 40px; border-radius: 10px; background: var(--border); animation: pulse 1.4s ease-in-out infinite; } }
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
.error-state { display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--danger); font-size: 0.72rem; text-align: center; padding: 8px; }

.card-footer { padding: 10px 16px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.footer-left { display: flex; align-items: center; gap: 6px; }
.success-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--success); background: var(--success-bg); padding: 3px 10px; border-radius: 20px; }

/* Watermark modal */
.modal-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-xl); width: 100%; max-width: 680px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow); position: relative; }
.modal-close { position: absolute; top: 12px; right: 12px; z-index: 10; background: var(--bg-glass); border: 1px solid var(--border); color: var(--text-muted); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all var(--transition); }
.modal-close:hover { color: var(--text); border-color: var(--border-light); }
.modal-header { padding: 20px 24px 0; }
.modal-header h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.modal-header p { font-size: 0.82rem; color: var(--text-muted); }
.modal-image-wrap { position: relative; margin: 16px 24px; border-radius: var(--radius); overflow: hidden; background: rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; cursor: crosshair; max-height: 55vh; }
.modal-image-wrap img { max-width: 100%; max-height: 55vh; object-fit: contain; display: block; }
.modal-canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; }
.modal-rect { position: absolute; z-index: 1; border: 2px dashed #10b981; background: rgba(16, 185, 129, 0.1); pointer-events: none; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px 20px; border-top: 1px solid var(--border); }

.card-enter-active { transition: all 0.35s ease; }
.card-leave-active { transition: all 0.25s ease; }
.card-enter-from { opacity: 0; transform: translateY(20px) scale(0.97); }
.card-leave-to { opacity: 0; transform: translateY(-10px) scale(0.97); }
.card-move { transition: transform 0.35s ease; }

@media (max-width: 640px) {
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-right { justify-content: center; }
  .card-body { flex-direction: column; }
  .preview-divider { transform: rotate(90deg); }
}
</style>
