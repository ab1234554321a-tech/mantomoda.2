// =============================================================================
//  Product Image Upload (ADR-013)
//
//  Why this exists: the admin panel could create products but only with an
//  external image URL. For a fashion boutique the photo IS the product, so a
//  real upload path is a hard requirement, not a nice-to-have.
//
//  Hardening:
//    - Admin-only (mounted behind requireRole('ADMIN')).
//    - Memory storage + explicit MIME allowlist, so nothing lands on disk before
//      validation passes (no path traversal, no "upload a .js" tricks).
//    - Real content sniffing via sharp: a file that merely claims to be a PNG
//      but is not a decodable image is rejected.
//    - Size ceiling (5 MB by default) and a per-product image cap.
//    - Files are written with generated names (never the client's filename) and
//      re-encoded to WebP, which strips EXIF/GPS metadata automatically.
//    - A thumbnail is produced for catalog grids, so listing pages stay light.
// =============================================================================
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { db } from '../db/store.js';
import { requireRole } from '../middlewares/auth.js';
import { uploadsDir } from '../db/persistence.js';

const router = Router();

const MAX_FILE_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024); // 5 MB
const MAX_IMAGES_PER_PRODUCT = Number(process.env.UPLOAD_MAX_IMAGES_PER_PRODUCT || 8);
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const GALLERY_WIDTH = Number(process.env.UPLOAD_GALLERY_WIDTH || 1200);
const THUMB_WIDTH = Number(process.env.UPLOAD_THUMB_WIDTH || 400);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      const error = new Error(`فرمت تصویر مجاز نیست. فرمت‌های مجاز: ${ALLOWED_MIME.join(', ')}`);
      error.code = 'UNSUPPORTED_IMAGE_TYPE';
      error.statusCode = 415;
      return cb(error);
    }
    cb(null, true);
  }
});

function ensureUploadsDir() {
  const dir = uploadsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Multer error translation so the client gets a useful Persian message. */
function handleMulterError(error, req, res, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'IMAGE_TOO_LARGE',
        message: `حجم تصویر بیش از حد مجاز است (حداکثر ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} مگابایت).`
      });
    }
    return res.status(400).json({ success: false, error: 'UPLOAD_ERROR', message: error.message });
  }

  if (error?.code === 'UNSUPPORTED_IMAGE_TYPE') {
    return res.status(error.statusCode || 415).json({ success: false, error: error.code, message: error.message });
  }

  return next(error);
}

// ---------------------------------------------------------------------------
// POST /api/admin/products/:id/images  (multipart, field name: "image")
// ---------------------------------------------------------------------------
router.post(
  '/products/:id/images',
  requireRole('ADMIN'),
  (req, res, next) => upload.single('image')(req, res, (err) => (err ? handleMulterError(err, req, res, next) : next())),
  async (req, res, next) => {
    try {
      const product = db.findProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: 'محصول یافت نشد.' });
      }

      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'NO_FILE', message: 'فایلی برای آپلود ارسال نشد.' });
      }

      const currentImages = product.images || [];
      if (currentImages.length >= MAX_IMAGES_PER_PRODUCT) {
        return res.status(409).json({
          success: false,
          error: 'IMAGE_LIMIT_REACHED',
          message: `حداکثر ${MAX_IMAGES_PER_PRODUCT} تصویر برای هر محصول مجاز است.`
        });
      }

      // Content sniffing: decode the actual pixels. A fake extension or spoofed
      // MIME type fails here, before anything touches the filesystem.
      let metadata;
      try {
        metadata = await sharp(req.file.buffer).metadata();
      } catch {
        return res.status(415).json({
          success: false,
          error: 'INVALID_IMAGE_CONTENT',
          message: 'فایل ارسال‌شده یک تصویر معتبر نیست.'
        });
      }

      const dir = ensureUploadsDir();
      const base = `${product.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const galleryName = `${base}.webp`;
      const thumbName = `${base}-thumb.webp`;

      // Re-encoding to WebP normalises the format and removes EXIF (incl. GPS).
      await sharp(req.file.buffer)
        .rotate() // honour EXIF orientation before stripping metadata
        .resize({ width: GALLERY_WIDTH, withoutEnlargement: true })
        .webp({ quality: Number(process.env.UPLOAD_WEBP_QUALITY || 82) })
        .toFile(path.join(dir, galleryName));

      await sharp(req.file.buffer)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: Number(process.env.UPLOAD_WEBP_QUALITY || 82) })
        .toFile(path.join(dir, thumbName));

      const galleryUrl = `/uploads/${galleryName}`;
      const thumbUrl = `/uploads/${thumbName}`;

      product.images = [...currentImages, galleryUrl];
      product.imageThumbnails = [...(product.imageThumbnails || []), thumbUrl];
      product.imageUpdatedAt = new Date().toISOString();
      db.persist();

      res.status(201).json({
        success: true,
        data: {
          productId: product.id,
          url: galleryUrl,
          thumbnailUrl: thumbUrl,
          width: metadata.width,
          height: metadata.height,
          originalFormat: metadata.format,
          storedFormat: 'webp',
          sizeBytes: req.file.size,
          images: product.images,
          thumbnails: product.imageThumbnails
        },
        message: 'تصویر محصول با موفقیت بارگذاری شد.'
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/admin/products/:id/images  (body: { url })
// ---------------------------------------------------------------------------
router.delete('/products/:id/images', requireRole('ADMIN'), (req, res) => {
  const product = db.findProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: 'محصول یافت نشد.' });
  }

  const { url } = req.body || {};
  if (!url || !String(url).startsWith('/uploads/')) {
    return res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL', message: 'آدرس تصویر نامعتبر است.' });
  }

  const index = (product.images || []).indexOf(url);
  if (index < 0) {
    return res.status(404).json({ success: false, error: 'IMAGE_NOT_FOUND', message: 'این تصویر روی محصول ثبت نشده است.' });
  }

  const thumb = (product.imageThumbnails || [])[index];

  product.images.splice(index, 1);
  if (product.imageThumbnails) product.imageThumbnails.splice(index, 1);
  db.persist();

  // Best-effort file cleanup; a missing file must not fail the request.
  for (const relative of [url, thumb]) {
    if (!relative) continue;
    const filename = path.basename(relative);
    const absolute = path.join(uploadsDir(), filename);
    // Guard against any traversal attempt in a stored value.
    if (!absolute.startsWith(uploadsDir())) continue;
    try { if (fs.existsSync(absolute)) fs.unlinkSync(absolute); } catch { /* ignore */ }
  }

  res.json({ success: true, data: product, message: 'تصویر حذف شد.' });
});

export default router;
