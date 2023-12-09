const multer = require("multer");
const fs = require("fs");
const path = require("path");
// Configure multer storage and file name

const uploadImage = multer({ dest: "images/" });

const uploadImageMiddleware = (req, res, next) => {
  // check if file is present
  console.log("uploadImageMiddleware");
  try {
    uploadImage.single("image")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      // Retrieve uploaded files
      const file = req.file;

      const errors = [];

      // Validate file types and sizes
      const allowedTypes = ["image/jpeg", "image/png"];
      const maxSize = 5 * 1024 * 1024; // 5MB

      if (!allowedTypes.includes(file.mimetype)) {
        errors.push(`Invalid file type: ${file.originalname}`);
      }

      if (file.size > maxSize) {
        errors.push(`File too large: ${file.originalname}`);
      }

      // Handle validation errors
      if (errors.length > 0) {
        // Remove uploaded files
        fs.unlinkSync(file.path);

        console.log("file removed");
        return res.status(400).json({ errors });
      }

      // Attach files to the request object
      req.file = file;

      // Proceed to the next middleware or route handler
      next();
    });
  } catch (error) {
    console.log(error);
  }
};

module.exports = uploadImageMiddleware;
