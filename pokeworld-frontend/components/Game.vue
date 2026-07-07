<template>
  <div class="w-full flex flex-col items-center justify-center pb-12">
    <div v-if="locationError" class="text-center text-red">
      This game does not work without location access, please enable location services and reload the page.
      <div class="flex w-full pt-4 justify-center">
        <div class="flex rounded-md cursor-pointer shadow-md px-5 py-2 text-white bg-grass" @click="continueWithoutLocation">
          Continue without location
        </div>
      </div>
    </div>
    <div v-else-if="!game.anyLoaded" class="w-full flex flex-col items-center justify-center">
      <div class="loading-container">
        <img src="/loading.gif">
      </div>
      <div class="text-lg text-grass">
        Loading..
      </div>
      <div class="px-4 py-2 cursor-pointer mt-7 shadow-md text-white bg-grass rounded-md" @click="resetGame">
        Reset
      </div>
    </div>
    <div
      v-else
      class="w-full flex justify-center"
      :class="{
        'flex-col': !game.debugPosition,
        'items-center': !game.debugPosition,
        'flex-row': game.debugPosition
      }"
    >
      <div>
        <div
          class="gameboy bg-gameboy-grey max-w-full flex flex-col items-center justify-center rounded-2xl shadow-md px-2 py-2 md:px-4 md:py-4"
        >
          <div
            class="flex flex-row overflow-scroll"
            :style="{
              maxWidth: (game.canvasWidth * game.scale) + 'px'
            }"
          >
            <canvas ref="pwg" class="bg-black rounded-lg" :width="(game.canvasWidth * game.scale)+'px'" :height="(game.canvasHeight*game.scale)+'px'" />
            <canvas v-if="game.showLayer1" ref="layer1" class="bg-black ml-8 rounded-lg" :width="(game.canvasWidth * game.scale)+'px'" :height="(game.canvasHeight*game.scale)+'px'" />
            <canvas v-if="game.showLayerGmap" ref="gmap" class="bg-black ml-8 rounded-lg" :width="(game.canvasWidth * game.scale)+'px'" :height="(game.canvasHeight*game.scale)+'px'" />
          </div>
          <div class="w-full pt-10 md:pt-14 pb-12">
            <div class="controls flex flex-row">
              <div class="dpad ml-4 md:ml-12">
                <div class="up" @click="action('moveUp')" />
                <div class="right" @click="action('moveRight')" />
                <div class="down" @click="action('moveDown')" />
                <div class="left" @click="action('moveLeft')" />
                <div class="middle" />
              </div>
              <div class="ml-auto a-b mr-4 md:mr-12">
                <div class="b">
                  B
                </div>
                <div class="a">
                  A
                </div>
              </div>
            </div>
            <div class="pt-12 md:pt-20" />
            <div class="start-select">
              <div class="select cursor-pointer" @click="zoom('out')">
                -
              </div>
              <div class="select cursor-pointer" @click="zoom('in')">
                +
              </div>
              <div class="select cursor-pointer" @click="game.debug = !game.debug">
                SELECT
              </div>
              <div class="start cursor-pointer">
                START
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="game.debug" class="flex flex-col md:px-12">
        <div
          class="flex flex-row items-center flex-wrap pt-8"
          :class="{
            'justify-center': !game.debugPosition
          }"
        >
          <div class="py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer" @click="game.regenerate = !game.regenerate">
            Regenerate {{ game.regenerate ? 'On' : 'Off' }}
          </div>
          <div class="py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer" @click="game.tileBrowser = !game.tileBrowser">
            Tile Browser {{ game.tileBrowser ? 'On' : 'Off' }}
          </div>
          <div class="py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer" @click="game.tileBrowserUsePlayer = !game.tileBrowserUsePlayer">
            Tile Browser Use Player Location {{ game.tileBrowserUsePlayer ? 'On' : 'Off' }}
          </div>
          <div class="py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer" @click="game.showLayer1 = !game.showLayer1">
            Layer 1 {{ game.showLayer1 ? 'On' : 'Off' }}
          </div>
          <div class="py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer" @click="game.showLayerGmap = !game.showLayerGmap">
            Gmap {{ game.showLayerGmap ? 'On' : 'Off' }}
          </div>
          <div class="py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer" @click="game.showStats = !game.showStats">
            Stats {{ game.showStats ? 'On' : 'Off' }}
          </div>
          <div class="py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer" @click="game.zoomMode = !game.zoomMode">
            Zoom Mode {{ game.zoomMode ? 'On' : 'Off' }}
          </div>
          <div class="py-2 px-8 mr-4 mb-4 bg-grass text-white cursor-pointer" @click="game.debugPosition = !game.debugPosition">
            Debug {{ game.debugPosition ? 'Right' : 'Bottom' }}
          </div>
          <div class="py-2 px-8 mb-4 bg-grass text-white cursor-pointer" @click="resetGame">
            Reset
          </div>
        </div>
        <div v-if="game.tileBrowser">
          <div class="flex flex-row pb-4">
            <div class="flex-col mr-2">
              <input v-model.number="game.tileBrowserX" placeholder="map X" class="py-2 px-4">
              <div class="flex pt-2">
                <div class="cursor-pointer bg-grass text-white py-1 px-3" @click="game.tileBrowserX -= 32">
                  -
                </div>
                <div class="cursor-pointer bg-grass text-white py-1 px-3 ml-auto" @click="game.tileBrowserX += 32">
                  +
                </div>
              </div>
            </div>
            <div class="flex-col">
              <input v-model.number="game.tileBrowserY" placeholder="map Y" class="py-2 px-4">
              <div class="flex pt-2">
                <div class="cursor-pointer bg-grass text-white py-1 px-3" @click="game.tileBrowserY -= 32">
                  -
                </div>
                <div class="cursor-pointer bg-grass text-white py-1 px-3 ml-auto" @click="game.tileBrowserY += 32">
                  +
                </div>
              </div>
            </div>
          </div>
          <div class="flex flex-col">
            <div>{{ tileBrowserTile ? 'Current' : 'None Found' }} {{ game.tileBrowserX }} {{ game.tileBrowserY }}</div>
            <pre class="whitespace-pre-wrap"> {{ JSON.stringify(tileBrowserTile, null, 2) }}</pre>
            <div v-for="(tile, idx) in tileBrowserTiles" :key="idx">
              <div>Tile History {{ idx }} </div>
              <pre class="whitespace-pre-wrap"> {{ JSON.stringify(tile, null, 2) }}</pre>
            </div>
          </div>
        </div>
        <div v-if="game.showStats" class="debug flex flex-col">
          <pre class="pt-4 whitespace-pre-wrap">{{ debug('player') }}</pre>
          <pre class="pt-4 whitespace-pre-wrap">{{ debug('game') }}</pre>
          <pre class="pt-4 whitespace-pre-wrap">{{ debug('map') }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
import { get } from 'lodash'

const tileSize = 32
const blockSize = 512
const blockCount = 16
const playerBoundaryOffset = 4
export default {
  name: 'Game',
  data() {
    return {
      images: [],
      blockDb: {},
      tileDb: {},
      tileHistoryDb: {},
      queries: {},
      locationError: false,
      storedImages: {},
      map: {
        width: blockCount - 1,
        x: 0,
        y: 0,
        blockX: 0,
        blockY: 0,
        lat: null,
        lng: null
      },
      game: {
        scale: 1,
        zoomMode: false,
        zoom: 1.25,
        zoomScale: 0.8,
        regenerate: false,
        anyLoaded: false,
        debugPosition: false,
        canvasWidth: 512,
        canvasHeight: 512,
        debug: false,
        initialized: false,
        showLayer1: false,
        showLayerGmap: false,
        showStats: false,
        columns: 1,
        blockCount,
        blockWidth: tileSize * blockCount,
        blockHeight: tileSize * blockCount,
        playerXBoundaryOffset: tileSize * playerBoundaryOffset,
        playerYBoundaryOffset: tileSize * playerBoundaryOffset,
        coords: {
          latitude: null,
          longitude: null
        },
        tileSize,
        blockSize,
        tileBrowser: false,
        tileBrowserUsePlayer: false,
        tileBrowserX: 0,
        tileBrowserY: 0
      },
      player: {
        initialized: false,
        sprite: 'char-walk-1',
        blockX: 0,
        blockY: 0,
        x: 0,
        y: 0
      }
    }
  },
  computed: {
    tileBrowserTile() {
      return Object.values(this.tileDb).find(tile => tile.mapX === this.game.tileBrowserX && tile.mapY === this.game.tileBrowserY)
    },
    tileBrowserTiles() {
      return this.tileHistoryDb[this.tileBrowserTile?.uuid]
    }
  },
  watch: {
    game: {
      handler() {
        if (this.game.initialized) {
          this.$store.commit('things/thing', {
            key: 'game',
            value: JSON.parse(JSON.stringify(this.game))
          })
        }
      },
      deep: true
    },
    'game.zoom'() {
      this.game.zoomScale = this.game.canvasWidth / (this.game.canvasWidth * this.game.zoom)
      this.getBlocks()
    },
    'game.regenerate'() {
      if (this.game.regenerate && this.game.initialized) {
        console.log('Game regenerate watcher getting blocks')
        this.getBlocks()
      }
    },
    map: {
      handler() {
        if (this.map.initialized) {
          this.$store.commit('things/thing', {
            key: 'map',
            value: JSON.parse(JSON.stringify(this.map))
          })
        }
      },
      deep: true
    },
    player: {
      handler() {
        if (this.player.initialized) {
          this.$store.commit('things/thing', {
            key: 'player',
            value: JSON.parse(JSON.stringify(this.player))
          })
          if (this.game.tileBrowserUsePlayer) {
            this.game.tileBrowserX = this.player.x
            this.game.tileBrowserY = this.player.y
          }
        }
      },
      deep: true
    },
    'player.x'() {
      this.updatePlayerBlock()
      this.updateMapBlock()
    },
    'player.y'() {
      this.updatePlayerBlock()
      this.updateMapBlock()
    },
    'player.blockX'() {
      if (this.player.initialized) {
        console.log('Player blockX watcher getting blocks')
        this.getBlocks()
      }
    },
    'player.blockY'() {
      if (this.player.initialized) {
        console.log('Player blockY watcher getting blocks')
        this.getBlocks()
      }
    },
    'tiles'() {
      window.tiles = this.tiles
    }
  },
  async mounted() {
    await this.getLocation()
    await this.initializeGame()
    await this.initializeMap()
    await this.initializePlayer()
    clearInterval(window.gameInterval)
    const fps = 60
    window.gameInterval = setInterval(this.renderCanvas, 1000 / fps)
  },
  methods: {
    // DEBUG
    debug(key) {
      return key + ' ' + JSON.stringify(this[key], undefined, 2)
    },

    // PLAYER
    updatePlayerBlock() {
      this.player.blockX = Math.floor(this.player.x / this.game.blockSize)
      this.player.blockY = Math.floor(this.player.y / this.game.blockSize)
      const blocks = Object.values(this.blockDb)
      for (const block of blocks) {
        if (block.x === this.player.blockX && block.y === this.player.blockY) {
          // this.player.block = block
          delete this.player.block
          this.player.latlng = block.lat + ', ' + block.lng
          break
        }
      }
    },
    initializePlayer() {
      console.log('Initializing player')
      const storedPlayer = JSON.parse(JSON.stringify(this.$store.state.things.player))
      if (storedPlayer && storedPlayer.x && storedPlayer.y) {
        console.log('Found stored player', storedPlayer.x, storedPlayer.y)
        delete storedPlayer.initialized
        // Object.assign(this.player, storedPlayer)
        this.player.x = storedPlayer.x
        this.player.y = storedPlayer.y
      } else {
        // do something
        this.player.x = this.map.x + ((this.game.blockCount / 2) * this.game.tileSize)
        this.player.y = this.map.y + ((this.game.blockCount / 2) * this.game.tileSize)
      }
      this.updatePlayerBlock()
      console.log('Player initialization getting blocks')
      this.getBlocks()
      this.player.keydown = this.onKeydown

      document.removeEventListener('keydown', window?.player?.keydown)
      window.player = this.player
      document.addEventListener('keydown', this.player.keydown)

      clearInterval(window.playerMovementQueueInterval)
      window.playerMovementQueueInterval = setInterval(() => {
        if (this.player.queuedAction) {
          const queuedAction = this.player.queuedAction
          this.action(queuedAction)
        }
      }, 50)

      this.$nextTick(() => {
        console.log('Initialized player')
        this.player.initialized = true
      })
    },
    moveRight() {
      const mapXRightCutoff = this.map.x + ((this.game.canvasWidth * this.game.zoom) - this.game.playerXBoundaryOffset)
      if (this.player.x >= mapXRightCutoff) {
        this.map.x += (this.game.tileSize * (this.game.zoomMode ? 8 : 1))
      }
      this.player.x = this.player.x + (this.game.tileSize * (this.game.zoomMode ? 8 : 1))
    },
    moveLeft() {
      const mapXLeftCutoff = this.map.x + this.game.playerXBoundaryOffset
      if (this.player.x < mapXLeftCutoff) {
        this.map.x -= (this.game.tileSize * (this.game.zoomMode ? 8 : 1))
      }
      this.player.x = this.player.x - (this.game.tileSize * (this.game.zoomMode ? 8 : 1))
    },
    moveUp() {
      const mapYUpCutoff = this.map.y + ((this.game.canvasHeight * this.game.zoom) - this.game.playerYBoundaryOffset)
      if (this.player.y >= mapYUpCutoff) {
        this.map.y += (this.game.tileSize * (this.game.zoomMode ? 8 : 1))
      }
      this.player.y = this.player.y + (this.game.tileSize * (this.game.zoomMode ? 8 : 1))
    },
    moveDown() {
      const mapYDownCutoff = this.map.y + this.game.playerYBoundaryOffset
      if (this.player.y < mapYDownCutoff) {
        this.map.y -= (this.game.tileSize * (this.game.zoomMode ? 8 : 1))
      }
      this.player.y = this.player.y - (this.game.tileSize * (this.game.zoomMode ? 8 : 1))
    },
    action(action) {
      if (this.player.lastAction && Date.now() - this.player.lastAction < 300) {
        if (!this.player.queuedAction) {
          this.player.queuedAction = action
        }
        return
      }
      delete this.player.queuedAction
      this.player.lastAction = Date.now()
      this[action]()
    },
    onKeydown(e) {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        this.action('moveRight')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        this.action('moveLeft')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.action('moveDown')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.action('moveUp')
      }
    },

    // MAP
    async initializeMap() {
      const storedMap = JSON.parse(JSON.stringify(this.$store.state.things.map))
      if (storedMap && storedMap.x && storedMap.y && storedMap.blockX && storedMap.blockY) {
        delete storedMap.initialized
        Object.assign(this.map, storedMap)
      } else if (this.game.coords) {
        console.log('game coords', this.game.coords)
        const resp = await this.$axios.get(process.env.API + '/blockLatLng', {
          params: {
            lng: this.game.coords.longitude,
            lat: this.game.coords.latitude
          }
        }).catch(err => console.error(err))
        console.log('resp', resp)
        if (resp && resp.data) {
          this.map.blockX = resp.data.block.x
          this.map.blockY = resp.data.block.y
          this.map.x = resp.data.block.x * this.game.blockWidth
          this.map.y = resp.data.block.y * this.game.blockHeight
        }
      }
      this.$nextTick(() => {
        this.map.initialized = true
      })
    },
    updateMapBlock() {
      this.map.blockX = this.player.blockX
      this.map.blockY = this.player.blockY
      this.map.lat = this.player.lat
      this.map.lng = this.player.lng
    },

    // GAME
    resetGame() {
      try {
        window.localStorage.clear()
        window.location.reload()
      } catch {

      }
    },
    initializeGame() {
      const storedGame = JSON.parse(JSON.stringify(this.$store.state.things.game))
      if (storedGame) {
        delete storedGame.initialized
        delete storedGame.anyLoaded
        delete storedGame.playerXBoundaryOffset
        delete storedGame.playerYBoundaryOffset
        delete storedGame.coords
        console.log('Setting zoom to', storedGame.zoom)
        Object.assign(this.game, storedGame)
      }
      this.$nextTick(() => {
        this.game.initialized = true
      })

      this.resizeGame()
      clearInterval(window.resizeInterval)
      window.resizeInterval = setInterval(() => {
        this.resizeGame()
      }, 1000)
      window.addEventListener('resize', (e) => {
        this.resizeGame()
      })
    },
    continueWithoutLocation() {
      window.localStorage.setItem('continueWithoutLocation', true)
      window.location.reload()
    },
    getLocation() {
      if (navigator.geolocation) {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition((position) => {
            this.game.coords.latitude = position.coords.latitude
            this.game.coords.longitude = position.coords.longitude
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            })
          }, (err) => {
            const continueWithoutLocation = window.localStorage.getItem('continueWithoutLocation')
            if (continueWithoutLocation === 'true') {
              console.log('Resolving fixed latitude longitude')
              resolve({
                longitude: 145.00569971273293,
                latitude: -37.87569351417865

              })
            } else {
              console.error(err)
              this.locationError = true
            }
          })
        })
      } else {
        if (this.game.continueWithoutLocation) {
          return {
            longitude: 145.00569971273293,
            latitude: -37.87569351417865

          }
        }
        return false
      }
    },
    resizeGame() {
      if (window.innerWidth > (2 * (this.game.canvasWidth)) * 1.2) {
        // do nothing
        this.game.columns = 2
        this.game.scale = 1
      } else if (window.innerWidth > (this.game.canvasWidth) * 1.2) {
        this.game.columns = 1
        this.game.scale = 1
      } else {
        this.game.columns = 1
        this.game.scale = (window.innerWidth / (this.game.canvasWidth)) * 0.91
      }
    },
    zoom(zoom) {
      if (zoom === 'in' && this.game.zoom > 0.75) {
        this.game.zoom = (this.game.zoom / (this.game.canvasWidth * this.game.zoom)) * ((this.game.canvasWidth * this.game.zoom) - (this.game.tileSize * 2))
        this.centreMap(zoom)
      } else if (zoom === 'out' && this.game.zoom < 3) {
        this.game.zoom = (1 / this.game.canvasWidth) * ((this.game.canvasWidth * this.game.zoom) + (this.game.tileSize * 2))
        this.centreMap(zoom)
      }
    },
    centreMap(zoom) {
      // if playerX in centre
      const mapXLowerCutoff = this.map.x + ((this.game.canvasWidth * this.game.zoom) / 2) - 32
      const mapXUpperCutoff = this.map.x + ((this.game.canvasWidth * this.game.zoom) / 2) + 64
      if (this.player.x >= mapXLowerCutoff && this.player.x < mapXUpperCutoff) {
        console.log('player detected in x center')
        if (zoom === 'in') {
          this.map.x += this.game.tileSize
        } else {
          this.map.x -= this.game.tileSize
        }
      } else if (this.player.x < (this.map.x + ((this.game.canvasWidth * this.game.zoom) / 2))) {
        console.log('player detected left of center')
        this.map.x -= 64
      } else {
        console.log('player detected right of center')
        this.map.x += 64
      }

      const mapYLowerCutoff = this.map.y + ((this.game.canvasHeight * this.game.zoom) / 2) - 32
      const mapYUpperCutoff = this.map.y + ((this.game.canvasHeight * this.game.zoom) / 2) + 64

      console.log('coords 2', mapXLowerCutoff, this.player.x, mapXUpperCutoff, '-', mapYLowerCutoff, this.player.y, mapYUpperCutoff)

      if (this.player.y >= mapYLowerCutoff && this.player.y < mapYUpperCutoff) {
        console.log('player detected in y center')
        if (zoom === 'in') {
          this.map.y += this.game.tileSize
        } else {
          this.map.y -= this.game.tileSize
        }
      } else if (this.player.y < (this.map.y + ((this.game.canvasHeight * this.game.zoom) / 2))) {
        console.log('player detected below center')
        this.map.y -= 64
      } else {
        console.log('player detected above center')
        this.map.y += 64
      }
    },
    renderCanvas() {
      const canvas = this.$refs.pwg
      const gMapCanvas = this.$refs.gmap
      const layer1 = this.$refs.layer1

      const tiles = Object.values(this.tileDb)

      // render floor tiles
      if (tiles) {
        this.map.tileCount = 0
        this.map.blocks = []
        tiles.forEach((tile, index) => {
          if (this.tileShouldRender(tile)) {
            if (!this.map.blocks.includes(tile.blockX + '_' + tile.blockY)) {
              this.map.blocks.push(tile.blockX + '_' + tile.blockY)
            }
            this.map.tileCount++
            const x = (tile.mapX - this.map.x)
            const y = (tile.mapY - this.map.y)
            const imageTileKey = this.images.indexOf(tile.img)
            if (imageTileKey >= 0) {
              const imageTile = this.storedImages[imageTileKey]
              if (imageTile?.loaded) {
                try {
                  const xpx = (this.game.tileSize * this.game.scale) * this.game.zoomScale
                  const ypx = (this.game.tileSize * this.game.scale) * this.game.zoomScale
                  const xx = (x * this.game.scale) * this.game.zoomScale
                  const yy = this.convertY(y, ypx)
                  layer1.getContext('2d').drawImage(imageTile.imgEl, xx, yy, xpx, ypx)
                } catch {
                }
              }
            }
            const image2TileKey = this.images.indexOf(tile.img2)
            if (image2TileKey >= 0) {
              const image2Tile = this.storedImages[image2TileKey]
              if (image2Tile?.loaded) {
                try {
                  const xpx = (this.game.tileSize * this.game.scale) * this.game.zoomScale
                  const ypx = (this.game.tileSize * this.game.scale) * this.game.zoomScale
                  const xx = (x * this.game.scale) * this.game.zoomScale
                  const yy = this.convertY(y, ypx)
                  canvas.getContext('2d').drawImage(image2Tile.imgEl, xx, yy, xpx, ypx)
                } catch {
                }
              }
            }
          }
        })
      }

      const blocks = Object.values(this.blockDb)

      if (blocks) {
        for (const block of blocks) {
          if (this.blockShouldRender(block)) {
            const x = (block.mapX - this.map.x)
            const y = (block.mapY - this.map.y)
            const imageBlockKey = this.images.indexOf(block.googleMap)
            if (imageBlockKey >= 0) {
              const imageBlock = this.storedImages[imageBlockKey]
              if (imageBlock?.loaded) {
                try {
                  const xpx = (this.game.blockSize * this.game.scale) * this.game.zoomScale
                  const ypx = (this.game.blockSize * this.game.scale) * this.game.zoomScale
                  const xx = (x * this.game.scale) * this.game.zoomScale
                  const yy = this.convertY(y, ypx)
                  gMapCanvas.getContext('2d').drawImage(imageBlock.imgEl, xx, yy, xpx, ypx)
                } catch {
                }
              }
            }
          }
        }
      }

      // render character
      if (this.player) {
        const imageKey = this.images.indexOf(this.player.sprite)
        if (imageKey >= 0) {
          const image = this.storedImages[imageKey]
          if (image?.loaded) {
            try {
              const x = (this.player.x - this.map.x)
              const y = (this.player.y - this.map.y)

              const xx = ((x + 2) * this.game.scale) * this.game.zoomScale
              const xpx = (28 * this.game.scale) * this.game.zoomScale
              const ypx = (42 * this.game.scale) * this.game.zoomScale
              const yy = this.convertY(y, ypx)
              canvas.getContext('2d').drawImage(image.imgEl, xx, yy, xpx, ypx)
              gMapCanvas.getContext('2d').drawImage(image.imgEl, xx, yy, xpx, ypx)
              layer1.getContext('2d').drawImage(image.imgEl, xx, yy, xpx, ypx)
            } catch {
            }
          }
        } else {
          this.images.push(this.player.sprite)
          const newImageKey = this.images.indexOf(this.player.sprite)

          const imgEl = new Image()
          this.storedImages[newImageKey] = {
            imgEl
          }
          imgEl.onload = (e) => {
            this.storedImages[newImageKey].loaded = true
          }
          imgEl.src = '/sprites/' + this.player.sprite + '.png'
        }
      }
    },
    tileShouldRender(tile) {
      let xValid = false
      let yValid = false

      if (
        tile.mapX >= this.map.x && tile.mapX < (this.map.x + (this.game.canvasWidth * this.game.zoom))
      ) {
        xValid = true
      }

      if (
        tile.mapY >= this.map.y && tile.mapY < (this.map.y + (this.game.canvasWidth * this.game.zoom))
      ) {
        yValid = true
      }

      return xValid && yValid
    },
    blockShouldRender(block) {
      let xValid = false
      let yValid = false

      const validXBlocks = [this.map.blockX - 2, this.map.blockX - 1, this.map.blockX, this.map.blockX + 1, this.map.blockX + 2]
      const validYBlocks = [this.map.blockY - 2, this.map.blockY - 1, this.map.blockY, this.map.blockY + 1, this.map.blockY + 2]

      if (
        validXBlocks.includes(block.x)
      ) {
        xValid = true
      }

      if (
        validYBlocks.includes(block.y)
      ) {
        yValid = true
      }

      return xValid && yValid
    },
    convertY(y, scaledHeight) {
      return (((this.game.canvasHeight * this.game.zoom) - y) * this.game.scale * this.game.zoomScale) - scaledHeight
    },
    async getBlocks() {
      console.log('Maybe getting blocks')
      if (this.player.blockX && this.player.blockY) {
        let count = 0
        const maybeOffsetLimit = Math.ceil(2 * (this.game.zoom / 2))
        const offsetLimit = maybeOffsetLimit < 2 ? 2 : maybeOffsetLimit
        const offsets = [
        ]
        for (const x of Array(offsetLimit).keys()) {
          for (const y of Array(offsetLimit).keys()) {
            offsets.push([x, y])
            if (x !== 0) {
              offsets.push([-x, y])
            }
            if (y !== 0) {
              offsets.push([x, -y])
            }
            if (x !== 0 && y !== 0) {
              offsets.push([-x, -y])
            }
          }
        }
        const offsetsToQuery = []
        for (const offset of offsets) {
          if (this.game.regenerate || !this.queries[(this.player.blockX + offset[0]) + ',' + (this.player.blockY + offset[1])]) {
            count++
            this.queries[(this.player.blockX + offset[0]) + ',' + (this.player.blockY + offset[1])] = 'pending'
            offsetsToQuery.push(offset)
          }
        }
        if (offsetsToQuery.length) {
          console.log('Getting', offsetsToQuery.length, 'blocks')
          const startTime = Date.now()
          console.log('Sending request for block', (this.player.blockX) + ',' + (this.player.blockY))
          let cc = 0
          const uniqueUuids = []
          const resp = await this.$axios.get(process.env.API + '/blocks', {
            params: {
              // regenerate: true,
              regenerate: this.game.regenerate,
              offsets: offsetsToQuery,
              blockX: this.player.blockX,
              blockY: this.player.blockY
            }
          }).catch(err => console.error(err))

          if (get(resp, 'data.blocks')) {
            setTimeout(() => {
              this.game.anyLoaded = true
            }, 500)

            console.log('Got', resp.data.blocks.length, 'blocks for block', (this.player.blockX) + ',' + (this.player.blockY))

            const tiles = resp.data.blocks.reduce((acc, block) => {
              return acc.concat(block.tiles)
            }, [])

            console.log('Got', tiles.length, 'tiles for block', (this.player.blockX) + ',' + (this.player.blockY))
            for (const tile of tiles) {
              if (tile) {
                if (!uniqueUuids.includes(tile.uuid)) {
                  uniqueUuids.push(tile.uuid)
                }
                if (
                  (this.tileDb[tile.uuid] && this.tileDb[tile.uuid].updated < tile.updated) ||
                !this.tileDb[tile.uuid]?.updated
                ) {
                  cc++
                  this.tileDb[tile.uuid] = tile
                } else if (!this.tileDb[tile.uuid]) {
                  cc++
                  this.tileDb[tile.uuid] = tile
                }
                if (!this.tileHistoryDb[tile.uuid]) {
                  this.tileHistoryDb[tile.uuid] = []
                }
                this.tileHistoryDb[tile.uuid].push(tile)
              }
            }
            this.storeTileData()
            for (const block of resp?.data?.blocks || []) {
              if (
                (this.blockDb[block.uuid] && this.blockDb[block.uuid].updated < block.updated) ||
                !this.blockDb[block.uuid]?.updated
              ) {
                this.blockDb[block.uuid] = block
              } else if (!this.blockDb[block.uuid]) {
                this.blockDb[block.uuid] = block
              }
            }
            this.storeBlockData()
          }
          console.log('Counted', cc, 'tiles updated and', uniqueUuids.length, 'unique tiles')

          const endTime = Date.now() - startTime
          console.log('Got', count, 'blocks in', endTime / 1000, 's')
        }
      } else {
        console.log('no player blockX or blockY')
      }
    },
    storeTileData() {
      const tiles = Object.values(this.tileDb)
      tiles.forEach((tile) => {
        if (tile.img2) {
          if (!this.images.includes(tile.img2)) {
            this.images.push(tile.img2)
            const imagesId = this.images.indexOf(tile.img2)
            const imgEl = new Image()
            this.storedImages[imagesId] = {
              imgEl
            }
            imgEl.onload = (e) => {
              this.storedImages[imagesId].loaded = true
            }
            imgEl.src = '/tiles/' + tile.img2 + '.png'
          }
        }
        if (tile.img) {
          if (!this.images.includes(tile.img)) {
            this.images.push(tile.img)
            const imagesId = this.images.indexOf(tile.img)
            const imgEl = new Image()
            this.storedImages[imagesId] = {
              imgEl
            }
            imgEl.onload = (e) => {
              this.storedImages[imagesId].loaded = true
            }
            imgEl.src = '/tiles/' + tile.img + '.png'
          }
        }
        if (tile.image) {
          if (!this.images.includes(tile.image)) {
            this.images.push(tile.image)
            const imagesIdGmap = this.images.indexOf(tile.image)
            const imgElGmap = new Image()
            this.storedImages[imagesIdGmap] = {
              imgEl: imgElGmap
            }
            imgElGmap.onload = (e) => {
              this.storedImages[imagesIdGmap].loaded = true
            }
            imgElGmap.src = 'data:image/png;base64,' + tile.image
          }
        }
      })
    },
    storeBlockData() {
      const blocks = Object.values(this.blockDb)
      blocks.forEach((block) => {
        if (block.googleMap) {
          if (!this.images.includes(block.googleMap)) {
            this.images.push(block.googleMap)
            const imagesIdGmap = this.images.indexOf(block.googleMap)
            const imgElGmap = new Image()
            this.storedImages[imagesIdGmap] = {
              imgEl: imgElGmap
            }
            imgElGmap.onload = (e) => {
              this.storedImages[imagesIdGmap].loaded = true
            }
            imgElGmap.src = 'data:image/png;base64,' + block.googleMap
          }
        }
      })
    }
  }
}
</script>
<style lang="scss">
.controls {
  display:flex;
  justify-content:space-between;

  .dpad {
    position:relative;
    display:inline-block;
    width:90px;
    height:90px;
    z-index:5;

    > * {
      width:33%;
      height:33%;
      position:absolute;
      background-color:#565e6a;
      cursor:pointer;

      i {
        position:relative;
        display:block;
        margin:0 auto;
        text-align:center;
        height:100%;
        font-size:28px;
        color:#333a4a;
        text-shadow:0px -0.5px 0px #aaa;
      }
    }

    .up {
      top:calc(0% + 4px);
      left:33%;
      border-top:4px solid black;
      border-left:4px solid black;
      border-right:4px solid black;
      border-radius:5px 5px 0px 0px;

      &:active {
        background:linear-gradient(to top, #565e6a 0%, #333 100%);
      }

      i {
        top:-5px;
      }
    }
    .right {
      top:33%;
      left:calc(66% - 4px);
      border-top:4px solid black;
      border-bottom:4px solid black;
      border-right:4px solid black;
      border-radius:0px 5px 5px 0px;
      box-shadow:0px -2px 0px #888 inset;

      &:active {
        background:linear-gradient(to right, #565e6a 0%, #333 100%);
      }

      i {
        top:-5px;
      }
    }
    .down {
      top:calc(66% - 4px);
      left:33%;
      border-left:4px solid black;
      border-bottom:4px solid black;
      border-right:4px solid black;
      border-radius:0px 0px 5px 5px;
      box-shadow:0px -2px 0px #888 inset;

      &:active {
        background:linear-gradient(to bottom, #565e6a 0%, #333 100%);
      }
    }
    .left {
      top:33%;
      left:calc(0% + 4px);
      border-top:4px solid black;
      border-bottom:4px solid black;
      border-left:4px solid black;
      border-radius:5px 0px 0px 5px;
      box-shadow:0px -2px 0px #888 inset;

      i {
        top:-5px;
      }

      &:active {
        background:linear-gradient(to left, #565e6a 0%, #333 100%);
      }
    }
    .middle {
      top:33%;
      left:33%;
      z-index:-5;

      &::after {
        content:'';
        position:absolute;
        top:20%;
        left:20%;
        display:inline-block;
        border:1px solid #6e737a;
        background:linear-gradient(to bottom, #6d7075 0%, #6d7075 30%, #23272f 70%, #23272f 100%);
        border-radius:50%;
        height:60%;
        width:60%;
      }
    }

    .up-down {
      background-color:#565e6a;
      border:4px solid black;
              border-radius:5px;
      width:20px;
      height:60px;
    }
    .left-right {
      background-color:#565e6a;
      border:4px solid black;
      border-radius:5px;
      width:60px;
      height:20px;
    }
  }
  .a-b {
    position:relative;
    display:inline-block;
    width:120px;
    height:90px;

    .a, .b {
      position:absolute;
      display:inline-block;
      font-size:22px;
      width:40px;
      height:40px;
      line-height: 40px;
      border-radius:50%;
      background-color:#2c313e;
      border-bottom:2px solid #888;
      box-shadow:-1px 1px 5px black, 0px 0px 5px black inset;
      text-shadow:0px -1px 1px #888;
      color:#2c313e;
      text-align:center;
      -webkit-user-select:none;
      cursor:pointer;
      transition:box-shadow 0.1s ease-out, border 0.1s ease-out, line-height 0.2s ease-out;

      &:active {
        box-shadow:-1px 1px 1px black, 0px 0px 5px black inset;
        border-width:0px;
        line-height:45px;
      }
    }
    .a {
      top:15px;
      right:10px;
    }
    .b {
      top:35px;
      left:0%;
    }
  }
}

.start-select {
  width:100%;
  height:60px;
  display:flex;
  justify-content:center;

  .select, .start {
    display:inline-block;
    color:#6b67ed;
    cursor: pointer;
    text-shadow:0px -1px 0px #3436bf;
    letter-spacing:-1px;
    width:60px;
    font-size:16px;
    text-align:center;
    margin-top:60px;

    &::before {
      content:'';
      display:block;
      margin:0 auto;
      width:30px;
      height:10px;
      margin-bottom:5px;
      border-radius:40%;
      background:linear-gradient(to bottom, #0b0a1c 0%, #0b0a1c 30%, #62636c 70%, #62636c 100%);
      background-repeat:no-repeat;
      border:2px solid #0b0a1c;
      box-shadow:0px -2px 1px #8482e9;
      cursor: pointer;
    }
    &:active::before {
      cursor: pointer;
      background:linear-gradient(to bottom, #0b0a1c 0%, #0b0a1c 50%, #62636c 100%);
    }
  }
}
</style>
