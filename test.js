import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLabelAndDelete(logPath, callback) {
  // Read the fileb
  fs.readFile(logPath, "utf8", (err, content) => {
    if (err || !content.trim()) return callback(null);
    console.log(content);
    let js = JSON.parse(content);
    callback(js.percentages);
    /*fs.unlink(logPath, (err) => {
      if (err) console.error("Failed to delete log:", err);
      return callback(label);
    });*/
  });
}
function getPercentages(logPath) {
  return new Promise((resolve) => {
    getLabelAndDelete(logPath, (label) => {
      resolve(label);
    });
  });
}
async function f() {
  console.log(await getPercentages(path.join(__dirname, "collector.json")));
}
f();
