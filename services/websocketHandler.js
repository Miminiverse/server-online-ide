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
  let processInfo = processStates.get(clientId) || {
    isRunning: true,
    initialOutputFiltered: false,
  };

  if (!processInfo.initialOutputFiltered) {
    let lines = output.split("\n");
    let filteredLines = lines.filter((line) => {
      const trimmed = line.trim();
      return !(
        trimmed.match(/docker run/i) ||
        trimmed.match(/ocker run/i) ||
        trimmed.match(/^sh -c/i) ||
        trimmed.match(/TEMP\/code-execution-temp/)
      );
    });

    if (filteredLines.some((line) => line.trim() !== "")) {
      processInfo.initialOutputFiltered = true;
    }
    output = filteredLines.join("\n");
    processStates.set(clientId, processInfo);
  }

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

function filterOutput(output, platform = "darwin") {
  const lines = output.replace(/\r\n/g, "\n").split("\n");

  const relevantLines = lines.filter((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return false;

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

    if (data.type === "execute") {
      const { code, language } = data;
      processStates.set(clientId, { isRunning: true });

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
            platform: process.platform,
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
