const WebSocket = require("ws");
const { executeCodeService } = require("./executeCode");

// Track active processes
const processStates = new Map();

function isWaitingForInput(output, language) {
  const cleanOutput = output.replace(/[\r\n]*$/, "").trim();
  if (!cleanOutput) return false;

  const inputPatterns = [
    /enter\s+(a|an|the)\s+.*[:>?]?\s*$/i,
    /input\s+.*[:>?]?\s*$/i,
    /:\s*$/,
    />\s*$/,
    /\?\s*$/,
    /waiting\s+for\s+input/i,
    /please\s+provide/i,
  ];

  const langPatterns = {
    cpp: [/cin\s*>>/, /scanf\s*\(/, /enter\s+.*:/i],
    python: [/input\s*\(/, /raw_input\s*\(/],
    javascript: [/prompt\s*\(/, /readline\s*\(/],
  };

  return (
    inputPatterns.some((p) => p.test(cleanOutput)) ||
    langPatterns[language]?.some((p) => p.test(cleanOutput)) ||
    false
  );
}

function processOutput(output, language, ws, clientId) {
  // Retrieve the current process state; add initialOutputFiltered flag if missing.
  let processInfo = processStates.get(clientId) || {
    isRunning: true,
    initialOutputFiltered: false,
  };

  // If we haven't yet seen valid (non-noise) output, filter out Docker/sh noise
  if (!processInfo.initialOutputFiltered) {
    // Split the output into lines
    let lines = output.split("\n");
    // Remove lines that look like Docker or shell commands
    let filteredLines = lines.filter((line) => {
      const trimmed = line.trim();
      return !(
        trimmed.match(/docker run/i) ||
        trimmed.match(/ocker run/i) ||
        trimmed.match(/^sh -c/i)
      );
    });
    // Check if any line remains that is not just empty noise
    if (filteredLines.some((line) => line.trim() !== "")) {
      // We now consider that we've seen real output.
      processInfo.initialOutputFiltered = true;
    }
    // Update output to the filtered lines
    output = filteredLines.join("\n");
    processStates.set(clientId, processInfo);
  }

  // Check for a shell prompt indicating process completion.
  if (output.match(/^(bash-\d+\.\d+\$|\$|>)\s*$/)) {
    ws.send(
      JSON.stringify({
        type: "status",
        status: "finished",
        exitCode: 0,
      })
    );
    processStates.delete(clientId);
    return;
  }

  // Use the existing filterOutput to apply additional noise filtering.
  const filteredOutput = filterOutput(output, process.platform);
  if (!filteredOutput) return;

  ws.send(JSON.stringify({ type: "output", data: filteredOutput }));

  if (processInfo.isRunning && isWaitingForInput(filteredOutput, language)) {
    ws.send(
      JSON.stringify({
        type: "inputRequired",
        prompt: filteredOutput,
      })
    );
  }
}

function filterOutput(output, platform = "linux") {
  console.log("Raw output:", output);
  const lines = output.replace(/\r\n/g, "\n").split("\n");

  const relevantLines = lines.filter((line) => {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) return false;

    // Skip any line that starts with a shell prompt (including extra text)
    // This covers: "bash-3.2$", "$", ">", followed by any spaces or text.
    if (trimmedLine.match(/^(bash-\d+\.\d+\$|\$|>)(\s+|$)/)) {
      return false;
    }

    // Noise patterns for Windows and other environments
    const noisePatterns = [
      /^Microsoft Windows \[Version/,
      /^\(c\) Microsoft Corporation/,
      /^C:\\.*>/,
      /docker run/,
      /WINDOWS\\SYSTEM32/,
      /^0;/,
      /^cmd\.exe/,
      /^Server running on port/,
      /TEMP\/code-execution-temp/,
      /sh -c ".+"/,
    ];

    // macOS-specific noise patterns to exclude
    if (platform === "darwin") {
      noisePatterns.push(
        /The default interactive shell is now zsh/,
        /To update your account to use zsh/,
        /For more details, please visit https:\/\/support\.apple\.com/,
        /^\[Process completed\]$/
      );
    }

    return !noisePatterns.some((pattern) => pattern.test(trimmedLine));
  });

  return relevantLines.length > 0 ? relevantLines.join("\n") : null;
}

function handleWebSocketMessage(ws, message, clientId) {
  try {
    const data = JSON.parse(message);
    console.log("Received message:", data);

    if (data.type === "execute") {
      processStates.set(clientId, { isRunning: true });
      const { code, language } = data;

      executeCodeService(code, language, (output) => {
        processOutput(output, language, ws, clientId);
      })
        .then(({ ptyProcess }) => {
          if (!ptyProcess) {
            throw new Error("Process initialization failed");
          }

          processStates.set(clientId, {
            ptyProcess,
            isRunning: true,
            platform: process.platform, // Store platform info
          });

          ptyProcess.on("exit", (exitCode) => {
            console.log(`Process exited with code: ${exitCode}`);
            ws.send(
              JSON.stringify({
                type: "status",
                status: "finished",
                exitCode,
              })
            );
            processStates.delete(clientId);
          });
        })
        .catch((error) => {
          ws.send(JSON.stringify({ type: "error", error: error.toString() }));
        });
    } else if (data.type === "input") {
      const processInfo = processStates.get(clientId);
      if (processInfo && processInfo.ptyProcess) {
        processInfo.ptyProcess.write(data.data + "\n");
      } else {
        ws.send(
          JSON.stringify({ type: "error", error: "No active process found." })
        );
      }
    }
  } catch (error) {
    console.error("Error handling message:", error);
    ws.send(JSON.stringify({ type: "error", error: error.toString() }));
    ws.close();
  }
}

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    const clientId = Date.now().toString();
    console.log(`Client connected: ${clientId}`);

    ws.on("message", (message) => {
      handleWebSocketMessage(ws, message, clientId);
    });

    ws.on("close", () => {
      const processInfo = processStates.get(clientId);
      if (processInfo && processInfo.ptyProcess) {
        processInfo.ptyProcess.kill();
        processStates.delete(clientId);
        console.log(`Process for ${clientId} terminated.`);
      }
    });
  });

  return wss;
}

module.exports = {
  setupWebSocketServer,
  isWaitingForInput,
  processOutput,
};
