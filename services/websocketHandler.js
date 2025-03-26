const WebSocket = require("ws");
const { executeCodeService } = require("./executeCode");

// Track active processes
const processStates = new Map();

/**
 * Function to detect if output indicates code is waiting for user input
 */
function isWaitingForInput(output, language) {
  const cleanOutput = output.replace(/[\r\n]*$/, "").trim();
  if (!cleanOutput) return false;

  // Common input patterns
  const inputPatterns = [
    /enter\s+(a|an|the)\s+.*[:>?]?\s*$/i,
    /input\s+.*[:>?]?\s*$/i,
    /:\s*$/, // Ends with colon
    />\s*$/, // Ends with >
    /\?\s*$/, // Ends with ?
    /waiting\s+for\s+input/i,
    /please\s+provide/i,
  ];

  // Language-specific patterns
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

/**
 * Enhanced output filter that detects shell prompts and input requirements
 */
function processOutput(output, language, ws, clientId) {
  // First check for shell prompt indicating process completion
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

  const filteredOutput = filterOutput(output);
  if (!filteredOutput) return;

  // Get current process state
  const processInfo = processStates.get(clientId) || { isRunning: true };

  // Always send output first
  ws.send(JSON.stringify({ type: "output", data: filteredOutput }));

  // Only check for input if process is still running
  if (processInfo.isRunning && isWaitingForInput(filteredOutput, language)) {
    ws.send(
      JSON.stringify({
        type: "inputRequired",
        prompt: filteredOutput,
      })
    );
  }
}

function filterOutput(output) {
  console.log("Raw output:", output);
  const lines = output.replace(/\r\n/g, "\n").split("\n");

  const relevantLines = lines.filter((line) => {
    const trimmedLine = line.trim();

    // Skip shell prompts and empty lines
    if (trimmedLine.match(/^(bash-\d+\.\d+\$|\$|>)\s*$/) || !trimmedLine) {
      return false;
    }

    // Comprehensive noise pattern matching
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
    ];

    return !noisePatterns.some((pattern) => pattern.test(trimmedLine));
  });

  return relevantLines.length > 0 ? relevantLines.join("\n") : null;
}

function handleWebSocketMessage(ws, message, clientId) {
  try {
    const data = JSON.parse(message);
    console.log("Received message:", data);

    if (data.type === "execute") {
      // Initialize process state
      processStates.set(clientId, { isRunning: true });
      const { code, language } = data;

      executeCodeService(code, language, (output) => {
        processOutput(output, language, ws, clientId);
      })
        .then(({ ptyProcess }) => {
          if (!ptyProcess) {
            throw new Error("Process initialization failed");
          }

          // Store process reference with additional info
          processStates.set(clientId, {
            ptyProcess,
            isRunning: true,
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
