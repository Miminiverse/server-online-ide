const { spawn } = require("node-pty"); // or import pty if you use node-pty
const fs = require("fs");
const path = require("path");

function executeCodeService(code, language, onData) {
  return new Promise((resolve, reject) => {
    const tempDir = "/tmp/code-execution-temp";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let fileName;
    let command;
    let args;

    switch (language) {
      case "python":
        fileName = "code.py";
        fs.writeFileSync(path.join(tempDir, fileName), code);
        command = "docker";
        args = [
          "run",
          "--rm",
          "-i",
          "-v",
          `${tempDir}:/app`,
          "python-executor",
          "sh",
          "-c",
          "python /app/code.py",
        ];
        break;

      case "cpp":
        fileName = "code.cpp";
        fs.writeFileSync(path.join(tempDir, fileName), code);
        command = "docker";
        args = [
          "run",
          "--rm",
          "-i",
          "-v",
          `${tempDir}:/app`,
          "cpp-executor",
          "sh",
          "-c",
          "g++ /app/code.cpp -o /app/code.out && /app/code.out",
        ];
        break;

      case "javascript":
        fileName = "code.js";
        fs.writeFileSync(path.join(tempDir, fileName), code);
        command = "docker";
        args = [
          "run",
          "--rm",
          "-i",
          "-v",
          `${tempDir}:/app`,
          "javascript-executor",
          "sh",
          "-c",
          "node /app/code.js",
        ];
        break;

      default:
        return reject(new Error("Unsupported language"));
    }

    const ptyProcess = spawn(command, args, {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env,
    });

    ptyProcess.on("data", (data) => {
      if (onData) onData(data);
    });

    ptyProcess.on("exit", (code) => {
      console.log("Docker process exited with code:", code);
    });

    resolve({ ptyProcess });
  });
}

module.exports = {
  executeCodeService,
};
