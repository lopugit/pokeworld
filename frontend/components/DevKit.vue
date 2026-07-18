<template>
  <div v-if="visible" class="devkit" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <!-- Popup panel (opens above the icon) -->
    <div v-if="open" class="devkit-panel" @mousedown.stop>
      <div class="devkit-head">
        <span>📍 Dev location</span>
        <span class="devkit-close" @click="open = false">✕</span>
      </div>
      <div class="devkit-hint">
        Pick a geocode to use when the browser can't grant location. Reloads the game with the chosen coords.
      </div>
      <div class="devkit-list">
        <div
          v-for="preset in presets"
          :key="preset.label"
          class="devkit-item"
          :class="{ 'devkit-item--active': isActive(preset) }"
          @click="select(preset)"
        >
          <div class="devkit-item-label">
            <span v-if="isActive(preset)" class="devkit-dot">●</span>{{ preset.label }}
          </div>
          <div class="devkit-item-coords">{{ preset.latitude.toFixed(5) }}, {{ preset.longitude.toFixed(5) }}</div>
        </div>
      </div>
      <div class="devkit-actions">
        <div class="devkit-reset" @click="useDeviceLocation">↺ Use real device location</div>
      </div>
    </div>

    <!-- Floating, draggable icon -->
    <div
      class="devkit-icon"
      :class="{ 'devkit-icon--on': hasOverride }"
      title="Dev location picker (drag to move, click to open)"
      @mousedown="startDrag"
      @click="onIconClick"
    >
      📍
    </div>
  </div>
</template>

<script>
// Preset geocodes for the dev location picker. First entry is the maintainer's
// real location; the rest are handy reference points.
const PRESETS = [
  { label: 'My location (Melbourne)', latitude: -37.859210163186276, longitude: 144.98227557143792 },
  { label: 'App default fallback', latitude: -37.87569351417865, longitude: 145.00569971273293 },
  { label: 'Sydney', latitude: -33.856784, longitude: 151.215297 },
  { label: 'San Francisco', latitude: 37.774929, longitude: -122.419418 },
  { label: 'London', latitude: 51.507351, longitude: -0.127758 },
  { label: 'Tokyo', latitude: 35.681236, longitude: 139.767125 }
]

const DRAG_THRESHOLD = 4

export default {
  name: 'DevKit',
  data() {
    return {
      visible: false, // dev-only; enabled in mounted() on localhost or ?dev
      open: false,
      presets: PRESETS,
      active: null, // { latitude, longitude } currently applied, if any
      pos: { x: 24, y: 24 }, // real position set on mount (client only)
      drag: { active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 }
    }
  },
  computed: {
    hasOverride() {
      return !!this.active
    }
  },
  mounted() {
    // Dev-only gate: show on localhost (any dev machine / preview) or when the
    // URL carries ?dev. On a real deployed host it stays hidden. Computed on the
    // client so SSR renders nothing (no hydration flash on production).
    const host = window.location.hostname
    const isLocal =
      host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')
    const forced = /(?:[?&])dev(?:=|&|$)/.test(window.location.search)
    this.visible = isLocal || forced
    if (!this.visible) return

    // Default to bottom-right, then restore any saved position.
    this.pos = { x: window.innerWidth - 72, y: window.innerHeight - 72 }
    try {
      const saved = JSON.parse(window.localStorage.getItem('devkitPos'))
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        this.pos = this.clampToViewport(saved)
      }
    } catch (err) { /* ignore */ }

    try {
      const dev = JSON.parse(window.localStorage.getItem('devGeocode'))
      if (dev && typeof dev.latitude === 'number' && typeof dev.longitude === 'number') {
        this.active = dev
      }
    } catch (err) { /* ignore */ }
  },
  beforeDestroy() {
    this.removeDragListeners()
  },
  methods: {
    isActive(preset) {
      return this.active &&
        Math.abs(this.active.latitude - preset.latitude) < 1e-9 &&
        Math.abs(this.active.longitude - preset.longitude) < 1e-9
    },
    clampToViewport(p) {
      return {
        x: Math.min(Math.max(0, p.x), window.innerWidth - 56),
        y: Math.min(Math.max(0, p.y), window.innerHeight - 56)
      }
    },
    onIconClick() {
      // Swallow the click that ends a drag; otherwise toggle the panel.
      if (this.drag.moved) {
        this.drag.moved = false
        return
      }
      this.open = !this.open
    },
    startDrag(e) {
      this.drag = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        originX: this.pos.x,
        originY: this.pos.y
      }
      window.addEventListener('mousemove', this.onDrag)
      window.addEventListener('mouseup', this.endDrag)
      e.preventDefault()
    },
    onDrag(e) {
      if (!this.drag.active) return
      const dx = e.clientX - this.drag.startX
      const dy = e.clientY - this.drag.startY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        this.drag.moved = true
      }
      this.pos = this.clampToViewport({ x: this.drag.originX + dx, y: this.drag.originY + dy })
    },
    endDrag() {
      this.drag.active = false
      this.removeDragListeners()
      try {
        window.localStorage.setItem('devkitPos', JSON.stringify(this.pos))
      } catch (err) { /* ignore */ }
    },
    removeDragListeners() {
      window.removeEventListener('mousemove', this.onDrag)
      window.removeEventListener('mouseup', this.endDrag)
    },
    select(preset) {
      // Persist the override; getLocation() in Game.vue reads this first.
      window.localStorage.setItem(
        'devGeocode',
        JSON.stringify({ latitude: preset.latitude, longitude: preset.longitude })
      )
      // The dev override supersedes the "continue without location" fallback.
      window.localStorage.removeItem('continueWithoutLocation')
      window.location.reload()
    },
    useDeviceLocation() {
      window.localStorage.removeItem('devGeocode')
      window.localStorage.removeItem('continueWithoutLocation')
      window.location.reload()
    }
  }
}
</script>

<style scoped>
.devkit {
  position: fixed;
  z-index: 99999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.devkit-icon {
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  background: #4b8b3b;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
  cursor: grab;
  user-select: none;
  border: 2px solid rgba(255, 255, 255, 0.85);
}
.devkit-icon:active {
  cursor: grabbing;
}
.devkit-icon--on {
  background: #2f6f22;
  box-shadow: 0 0 0 3px rgba(75, 139, 59, 0.35), 0 3px 10px rgba(0, 0, 0, 0.35);
}
.devkit-panel {
  position: absolute;
  bottom: 60px;
  right: 0;
  width: 250px;
  background: #ffffff;
  color: #1f2937;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  padding: 10px;
  cursor: default;
}
.devkit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}
.devkit-close {
  cursor: pointer;
  color: #9ca3af;
  padding: 0 4px;
}
.devkit-close:hover {
  color: #4b5563;
}
.devkit-hint {
  font-size: 11px;
  line-height: 1.35;
  color: #6b7280;
  margin-bottom: 8px;
}
.devkit-list {
  max-height: 240px;
  overflow-y: auto;
}
.devkit-item {
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.devkit-item:hover {
  background: #f0f7ed;
}
.devkit-item--active {
  background: #eaf4e4;
}
.devkit-item-label {
  font-size: 13px;
  font-weight: 600;
}
.devkit-item-coords {
  font-size: 11px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.devkit-dot {
  color: #4b8b3b;
  font-size: 9px;
  margin-right: 6px;
  vertical-align: middle;
}
.devkit-actions {
  border-top: 1px solid #eef0f2;
  margin-top: 6px;
  padding-top: 6px;
}
.devkit-reset {
  font-size: 12px;
  color: #4b8b3b;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
}
.devkit-reset:hover {
  background: #f0f7ed;
}
</style>
