import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLabelAndDelete(logPath, callback) {
  // Check if file exists
  fs.stat(logPath, (err, stats) => {
    if (err || !stats || stats.size === 0) {
      return callback(null); // file missing or empty
    }

    // Read the file
    fs.readFile(logPath, "utf8", (err, content) => {
      if (err || !content.trim()) return callback(null);

      // Extract label
      const match = content.match(/label=([^\s]+)/);
      if (!match) return callback(null);

      const label = match[1];

      // Delete the file
      fs.unlink(logPath, (err) => {
        if (err) console.error("Failed to delete log:", err);
        return callback(label);
      });
    });
  });
}
getLabelAndDelete(path.join(__dirname, "file.log"), (l) => {
  console.log(l);
});
