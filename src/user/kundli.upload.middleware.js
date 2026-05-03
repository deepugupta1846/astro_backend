const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsDir = path.join(process.cwd(), "public", "uploads", "kundli");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".dat";
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safe);
  },
});

const allowExt = /\.(jpe?g|png|gif|webp|heic|heif|bmp|pdf)$/i;

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "");
    const mimeOk = /^image\//.test(mime) || mime === "application/pdf";
    const extOk = allowExt.test(name);
    if (mimeOk || extOk) return cb(null, true);
    cb(new Error("Only image or PDF files are allowed"));
  },
});

function kundliUploadMiddleware(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Invalid kundli file",
      });
    }
    next();
  });
}

module.exports = { kundliUploadMiddleware };
