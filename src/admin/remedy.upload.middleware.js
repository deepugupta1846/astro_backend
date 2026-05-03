const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsDir = path.join(process.cwd(), "public", "uploads", "remedies");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safe);
  },
});

const imageExt = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    const name = file.originalname || "";
    const mimeOk = /^image\//.test(mime);
    const extOk = imageExt.test(name);
    const octetWithExt =
      (mime === "application/octet-stream" ||
        mime === "binary/octet-stream") &&
      extOk;
    if (mimeOk || extOk || octetWithExt) return cb(null, true);
    cb(
      new Error(
        "Only image files are allowed (jpg, png, webp, heic, gif, etc.)"
      )
    );
  },
});

/**
 * multipart field name: image (optional)
 */
function remedyUploadMiddleware(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Invalid image",
      });
    }
    next();
  });
}

module.exports = { remedyUploadMiddleware };
