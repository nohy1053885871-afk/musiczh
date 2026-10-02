import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import {
  FOOTER_HOVER_MAX_BYTES,
  FooterHoverCardError,
  footerHoverCardStore,
  validateFooterHoverImage,
  type FooterHoverCardConfig,
  type FooterHoverCardStore,
} from '../lib/footerHoverCard.js'
import { requireAdmin } from '../middleware/auth.js'

const MAX_MULTIPART_BYTES = FOOTER_HOVER_MAX_BYTES + 64 * 1024

const FieldsSchema = z.object({
  enabled: z.enum(['true', 'false']),
  label: z.string(),
  removeImage: z.enum(['true', 'false']),
}).strict()

type UploadFile = {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

function isUploadFile(value: unknown): value is UploadFile {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.name === 'string' &&
    typeof item.type === 'string' &&
    typeof item.size === 'number' &&
    typeof item.arrayBuffer === 'function'
  )
}

function adminResponse(config: FooterHoverCardConfig) {
  return {
    ...config,
    image: config.image
      ? {
          ...config.image,
          url: `/api/admin/footer-hover-card/image?v=${config.image.updatedAt}`,
        }
      : null,
  }
}

function errorStatus(error: FooterHoverCardError): 400 | 413 {
  return error.code === 'image_too_large' ? 413 : 400
}

export function createAdminFooterHoverCardRouter(
  store: FooterHoverCardStore = footerHoverCardStore,
) {
  const router = new Hono()
  router.use('*', requireAdmin)

  router.get('/', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json(adminResponse(store.getAdminConfig()))
  })

  router.get('/image', (c) => {
    const image = store.getImage()
    if (!image) return c.json({ error: 'image_not_found' }, 404)
    c.header('Cache-Control', 'no-store')
    c.header('Content-Type', image.mimeType)
    c.header('Content-Length', String(image.byteSize))
    c.header('Content-Disposition', 'inline')
    c.header('X-Content-Type-Options', 'nosniff')
    return c.body(new Uint8Array(image.data).buffer)
  })

  router.put(
    '/',
    bodyLimit({
      maxSize: MAX_MULTIPART_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    async (c) => {
      let form: FormData
      try {
        form = await c.req.formData()
      } catch {
        return c.json({ error: 'invalid_multipart' }, 400)
      }

      const knownFields = new Set(['enabled', 'label', 'removeImage', 'image'])
      if ([...form.keys()].some((key) => !knownFields.has(key))) {
        return c.json({ error: 'invalid_payload' }, 400)
      }
      const parsed = FieldsSchema.safeParse({
        enabled: form.get('enabled'),
        label: form.get('label'),
        removeImage: form.get('removeImage'),
      })
      if (!parsed.success) {
        return c.json(
          { error: 'invalid_payload', detail: parsed.error.issues },
          400,
        )
      }

      const candidate = form.get('image')
      let image
      try {
        if (candidate !== null) {
          if (!isUploadFile(candidate)) {
            return c.json({ error: 'invalid_image_field' }, 400)
          }
          if (candidate.size > FOOTER_HOVER_MAX_BYTES) {
            return c.json({ error: 'image_too_large' }, 413)
          }
          image = validateFooterHoverImage(
            new Uint8Array(await candidate.arrayBuffer()),
            candidate.type,
          )
        }

        const saved = store.save({
          enabled: parsed.data.enabled === 'true',
          label: parsed.data.label,
          removeImage: parsed.data.removeImage === 'true',
          image,
        })
        c.header('Cache-Control', 'no-store')
        return c.json(adminResponse(saved))
      } catch (error) {
        if (error instanceof FooterHoverCardError) {
          console.warn(`[footer-hover-card] rejected: ${error.code}`)
          return c.json({ error: error.code }, errorStatus(error))
        }
        throw error
      }
    },
  )

  return router
}

export default createAdminFooterHoverCardRouter()
