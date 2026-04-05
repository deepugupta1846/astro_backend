/**
 * POST /api/v1/upload/image
 * multipart field name: image
 */
exports.uploadImage = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file (use field name: image)",
      });
    }
    const rel = `/uploads/astro/${req.file.filename}`;
    const base = `${req.protocol}://${req.get("host")}`;
    res.status(200).json({
      success: true,
      message: "Uploaded",
      data: { url: base + rel },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Upload failed",
    });
  }
};
