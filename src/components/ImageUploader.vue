<template>
  <div
    class="uploader"
    :class="{ 'uploader-dragging': isDragging }"
    @click="openFileDialog"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <input
      ref="fileInput"
      type="file"
      multiple
      accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
      hidden
      @change="onFileChange"
    />
    <div class="uploader-ring"></div>
    <div class="uploader-content">
      <div class="uploader-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div class="uploader-texts">
        <p class="uploader-title"><span>点击上传</span> 或拖拽图片到此处</p>
        <p class="uploader-hint">支持 PNG · JPG · WebP · BMP · GIF</p>
      </div>
      <button class="uploader-btn" @click.stop="openFileDialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        选择文件
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['files-selected'])
const fileInput = ref(null)
const isDragging = ref(false)

function openFileDialog() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const files = e.target.files
  if (files.length > 0) {
    emit('files-selected', Array.from(files))
  }
  fileInput.value.value = ''
}

function onDragOver() { isDragging.value = true }
function onDragLeave() { isDragging.value = false }

function onDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files?.length > 0) {
    const imageFiles = Array.from(files).filter((f) =>
      /^image\/(png|jpeg|webp|bmp|gif)$/.test(f.type)
    )
    if (imageFiles.length > 0) {
      emit('files-selected', imageFiles)
    }
  }
}
</script>

<style lang="scss" scoped>
.uploader {
  position: relative;
  border-radius: var(--radius-xl);
  padding: 56px 32px;
  text-align: center;
  cursor: pointer;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  overflow: hidden;
  transition: all var(--transition);

  &:hover {
    border-color: var(--primary);
    background: var(--primary-subtle);

    .uploader-ring {
      opacity: 1;
    }
    .uploader-icon svg {
      stroke: var(--primary);
    }
    .uploader-btn {
      background: var(--primary);
      color: #fff;
    }
  }

  &-dragging {
    border-color: var(--primary) !important;
    background: var(--primary-subtle) !important;
    transform: scale(1.01);

    .uploader-ring {
      opacity: 1;
      animation: ringPulse 1.2s ease-in-out infinite;
    }
  }
}

.uploader-ring {
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  border: 1.5px solid transparent;
  background: conic-gradient(
    transparent 0deg,
    transparent 200deg,
    var(--primary) 250deg,
    var(--ai) 300deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

@keyframes ringPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.uploader-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.uploader-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);

  svg {
    color: var(--text-muted);
    transition: stroke var(--transition);
  }
}

.uploader-texts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.uploader-title {
  font-size: 1rem;
  color: var(--text-secondary);

  span {
    color: var(--primary);
    font-weight: 600;
    transition: color var(--transition);
  }
}

.uploader-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.uploader-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-glass);
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);

  &:hover {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
  }
}
</style>
