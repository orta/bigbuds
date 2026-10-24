/**
 * Draws the app icon, and every raster size the platforms ask for, from one
 * definition.
 *
 * The mark is the `boxes` glyph the header already uses as the logo, so the
 * tab icon and the thing at the top of the page are the same drawing rather
 * than two things that resemble each other. It is Lucide's, ISC-licensed, and
 * the path is inlined from the `@iconify-json/lucide` data this project
 * already depends on for the in-app icons.
 *
 * Run with `yarn icons`. The outputs are committed, so this only needs
 * running when the artwork changes — it is a build step nothing depends on at
 * runtime, which is why it uses the `sharp` that `@nuxt/image` installs
 * rather than pulling in a dependency of its own.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** Near-black, matching the app's dark background and its `theme-color`. */
const PLATE = '#0a0a0a'
/** Tailwind's lime-500, which `--ui-primary` resolves to in `main.css`. */
const LIME = '#84cc16'

/** Lucide `boxes`, drawn on a 24×24 grid with a 2-unit stroke. */
const BOXES = 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3zM7 16.5l-4.74-2.85M7 16.5l5-3m-5 3v5.17m5-8.17V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5zm5 3l-5-3m5 3l4.74-2.85M17 16.5v5.17M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3l5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0zM12 8L7.26 5.15M12 8l4.74-2.85M12 13.5V8'

/**
 * Lucide `box` — the same family, one cube instead of three.
 *
 * Optical sizing, not indecision: three cubes at 16px is five pixels each and
 * renders as a green blob, which is what a browser tab and a bookmarks list
 * actually ask for. One cube survives it.
 */
const BOX = 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16ZM3.3 7l8.7 5l8.7-5M12 22V12'

/**
 * The same cube as a silhouette: a filled hexagon split by the three faces.
 *
 * For 16px alone. Line art that thin has nowhere to go at that size — the
 * strokes close up and the cube fills in — so this inverts it and lets the
 * dark plate draw the edges instead.
 */
const SOLID_BOX = `<path d="M12 2 21 7v10l-9 5-9-5V7Z" fill="${LIME}"/>
    <path d="M12 12 3 7M12 12l9-5M12 12v10" fill="none" stroke="${PLATE}"
          stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`

/**
 * One icon, as SVG.
 *
 * `scale` is the fraction of the canvas the glyph occupies, and it is the only
 * thing that differs between the ordinary icons and the maskable one: Android
 * crops a maskable icon to whatever shape the launcher likes, so its artwork
 * has to sit inside the middle 80% and its plate has to reach every corner.
 */
function icon({
  size,
  scale = 0.58,
  radius = size * 0.22,
  glyph: path = BOXES,
  stroke = 2,
  /** Pre-drawn markup on the same 24×24 grid, for artwork that is not one stroked path. */
  art,
}) {
  const glyph = size * scale
  const offset = (size - glyph) / 2
  const unit = glyph / 24

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${PLATE}"/>
  <g transform="translate(${offset} ${offset}) scale(${unit})"
     fill="none" stroke="${LIME}" stroke-width="${stroke}"
     stroke-linecap="round" stroke-linejoin="round">
    ${art ?? `<path d="${path}"/>`}
  </g>
</svg>`
}

/**
 * Rasterises at the size asked for.
 *
 * Drawn at the target size rather than scaled down from one big master: a
 * 16px icon resampled from 512 is a blur, where the same vectors rasterised
 * at 16 land on the pixel grid.
 */
const png = (options, size) => {
  const image = sharp(Buffer.from(icon({ ...options, size })))
  // Square-edged icons have nothing to be transparent *for*, and iOS in
  // particular would rather not be handed an alpha channel at all.
  const opaque = options.radius === 0
  return (opaque ? image.flatten({ background: PLATE }) : image)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * An `.ico` holding several PNGs.
 *
 * Written by hand because `sharp` does not encode ICO. The format is a
 * six-byte header, a sixteen-byte directory entry per image, then the image
 * data — and since Vista an entry's data may be a whole PNG file rather than
 * a bitmap, which is what this writes.
 */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16

  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    // 0 means 256: the field is one byte, so the largest size wraps to zero.
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // palette colours; 0 for truecolour
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images.map(image => image.data)])
}

/**
 * Android's notification badge.
 *
 * The odd one out, and it has to be: Android throws away every colour in this
 * image and keeps only the alpha channel, then tints the result to match the
 * status bar. So there is no plate and no lime — a white glyph on nothing,
 * where "white" is only a way of saying "opaque". Drawing the usual icon here
 * would produce a filled square, because the plate is opaque everywhere.
 *
 * It is the single cube for the same reason the 16px favicon is: it renders at
 * about 24 device pixels in a status bar, where three cubes are a smudge.
 */
function badge(size = 96) {
  const glyph = size * 0.82
  const offset = (size - glyph) / 2
  const unit = glyph / 24

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${offset} ${offset}) scale(${unit})"
     fill="none" stroke="#ffffff" stroke-width="2.4"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="${BOX}"/>
  </g>
</svg>`
}

/**
 * The link-preview card.
 *
 * The one piece of this that is not an icon, and the reason it exists: the way
 * somebody joins KAL Pal is a member sending them the link, so the link has to
 * say what it is when it lands in a chat thread.
 */
function socialCard() {
  const glyph = 132
  const unit = glyph / 24
  const label = { family: 'Helvetica Neue, Helvetica, Arial, sans-serif' }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PLATE}"/>
  <g transform="translate(124 158) scale(${unit})"
     fill="none" stroke="${LIME}" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="${BOXES}"/>
  </g>
  <text x="288" y="262" fill="#fafafa" font-family="${label.family}"
        font-size="104" font-weight="700" letter-spacing="-3">KAL Pal</text>
  <text x="126" y="392" fill="#a1a1aa" font-family="${label.family}" font-size="40">
    Book KAL classes, and see which of your
  </text>
  <text x="126" y="446" fill="#a1a1aa" font-family="${label.family}" font-size="40">
    gym buddies are going.
  </text>
  <rect x="126" y="506" width="132" height="8" rx="4" fill="${LIME}"/>
</svg>`
}

const write = (name, data) => writeFile(join(publicDir, name), data)

await mkdir(publicDir, { recursive: true })

/** The full mark, for anywhere with the pixels to show it. */
const MARK = {}

/**
 * The single cube, for the sizes that cannot hold three.
 *
 * Larger and heavier-stroked than the mark, because at 16px a 0.8px stroke
 * lands between pixels and comes out as a smudge.
 */
const SMALL = { glyph: BOX, scale: 0.74, stroke: 2.6 }

/** The scalable one, which is what a modern browser prefers for the tab. */
await write('icon.svg', icon({ size: 512 }))

await write('icon-192.png', await png(MARK, 192))
await write('icon-512.png', await png(MARK, 512))

/**
 * iOS rounds the corners itself and puts the icon on whatever wallpaper is
 * behind it, so this one is square-edged and fully opaque.
 */
await write('apple-touch-icon.png', await png({ radius: 0 }, 180))

/** Android's maskable slot: full bleed, artwork inside the middle 80%. */
await write('icon-maskable-512.png', await png({ scale: 0.46, radius: 0 }, 512))

/** The status-bar mark on a pushed notification. Alpha only — see `badge`. */
await write('badge.png', await sharp(Buffer.from(badge()))
  .png({ compressionLevel: 9 })
  .toBuffer())

/**
 * The tab icon, at the three sizes browsers pick from.
 *
 * The small two carry the single cube and the largest the full mark, which is
 * the whole reason for shipping several: whichever the browser picks,
 * something legible arrives.
 */
await write('favicon.ico', ico(await Promise.all([
  { size: 16, art: { art: SOLID_BOX, scale: 0.78 } },
  { size: 32, art: SMALL },
  { size: 48, art: MARK },
].map(async ({ size, art }) => ({ size, data: await png(art, size) })))))

await write('og-image.png', await sharp(Buffer.from(socialCard()))
  .flatten({ background: PLATE })
  .png({ compressionLevel: 9 })
  .toBuffer())

console.log('Wrote icons to public/')
