const multer = require("multer");
const path = require("path");
const fs = require("fs");
const uploadController = require("./upload.controller");

const uploadsDir = path.join(process.cwd(), "public", "uploads", "astro");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safe);
  },
});

const imageExt = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    const name = file.originalname || "";
    // Accept any image/* (jpeg, png, heic, webp, etc.) or known extension if MIME is wrong
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

module.exports = (app) => {
  app.post(
    "/api/v1/upload/image",
    (req, res, next) => {
      upload.single("image")(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            success: false,
            message: err.message || "Invalid file",
          });
        }
        next();
      });
    },
    uploadController.uploadImage
  );
};
