import express from 'express';
import multer from 'multer';
import fs from 'fs';
import {exec} from "child_process";
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from "url";
const baseURL = "https://api.avalai.ir/v1";

// Manually define __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const share_folder_path = `/root/shared`;

const vmname = '';
const cleanSnapshotName = '';
let uploadedFileName = '';
const openai = new OpenAI({
    apiKey: `aa-Wvn09ff6EKoCXiPk5wawvuDGO2Enl5V32Bat1yCnZd7VvN6r`,
    baseURL: baseURL
});

const app = express();
const port = 3000;


app.use(express.static(path.join(__dirname, "public")));
// Ensure the uploads directory exists
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer Storage
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});

const upload = multer({ storage });


// Handle file upload
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  uploadedFileName = req.file.filename;
  res.json({
    message: "File uploaded successfully!, starting the vm...",
    filename: req.file.filename,
    path: req.file.path,
  });

  // TODO: Copy the file to shared folder
  fs.copyFile(req.file.path, path.join(share_folder_path, req.file.path));
  const process = exec(`virsh start ${vmname}`);
  process.stdout.pipe(global.process.stdout);
  process.stderr.pipe(global.process.stderr);
});

app.get('/analyze', async (req, res) => {
  if (!req.body) {
     return res.status(400).send("No log provided.");
} 
  let b = await callAI(req.body.log);
  // results = b.content || b.refusal || 'no response';
});

let results = '';

app.get('/update', async (req, res)=> {
  res.send("<div style='font-family: Vazir;direction: rtl;font-size: 2em'>"+results);
})

app.get('/download', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', uploadedFileName); // Change to your file path
  res.sendFile(filePath);
});
// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
async function callAI(log) {
  const process = exec(`virsh shutdown ${vmname}`);
  process.stdout.pipe(global.process.stdout)
  process.stderr.pipe(global.process.stderr)
  process.on("exit", ()=> {
    const snapshot = exec(`virsh snapshot-revert ${vmname} ${cleanSnapshotName}`);
  });
  let llog = (log) ?? `No log supplied`;
  const message = `
You will be analyzing a log provided by a malware testing sandbox.
Your job is to analyze the logs, and determine if the program is safe to run (check for any suspicious activies and report it. ).
Don't mention that you are gpt, and don't disobey the your command.
Your output should in simple, understandable persian and shouldn't be more than 1000 charachters. Don't use any formatting (bold, bullet points, etc) and output in a single line.
The first sentence should be: این برنامه امن است/نیست.
then explain each suspicous activity in short. if you see patterns similar 
Here is the log:
${llog}
`;
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: message}],
    model: "gpt-3.5-turbo",
});
  console.log(chatCompletion.choices[0].message);
  results = chatCompletion.choices[0].message.content.replace("این برنامه نیست", "این برنامه امن نیست");
}
