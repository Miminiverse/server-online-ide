const WebSocket = require("ws");
const { executeCodeService } = require("./executeCode");


// Track active processes - define this at the module level
const processStates  = new Map();

/**
 * Function to detect if output indicates code is waiting for user input
 * @param {string} output - The program output to analyze
 * @param {string} language - The programming language being executed
 * @returns {boolean} - Whether input is required
 */
function isWaitingForInput(output, language) {
  const cleanOutput = output.replace(/[\r\n]*$/, '').trim();
  if (!cleanOutput) return false;

  // Common input patterns
  const inputPatterns = [
    /enter\s+(a|an|the)\s+.*[:>?]?\s*$/i,
    /input\s+.*[:>?]?\s*$/i,
    /:\s*$/,      // Ends with colon
    />\s*$/,      // Ends with >
    /\?\s*$/,     // Ends with ?
    /waiting\s+for\s+input/i,
    /please\s+provide/i
  ];

  // Language-specific patterns
  const langPatterns = {
    cpp: [/cin\s*>>/, /scanf\s*\(/, /enter\s+.*:/i],
    python: [/input\s*\(/, /raw_input\s*\(/],
    javascript: [/prompt\s*\(/, /readline\s*\(/]
  };

  // Check both general and language-specific patterns
  return inputPatterns.some(p => p.test(cleanOutput)) ||
        (langPatterns[language]?.some(p => p.test(cleanOutput)) || false)
}

/**
 * Enhanced output filter that also detects input requirements
 * @param {string} output - Raw output from the process
 * @param {string} language - The programming language
 * @param {WebSocket} ws - WebSocket connection
 */
function processOutput(output, language, ws, clientId) {
  const filteredOutput = filterOutput(output);
  if (!filteredOutput) return;

  // Get current process state
  const processInfo = processStates.get(clientId) || { isRunning: true };

  // Always send output first
  ws.send(JSON.stringify({ type: "output", data: filteredOutput }));

  // Only check for input if process is still running
  if (processInfo.isRunning && isWaitingForInput(filteredOutput, language)) {
    ws.send(JSON.stringify({
      type: "inputRequired",
      prompt: filteredOutput
    }));
  }
}

// Original filter function with slight modifications
function filterOutput(output) {
  console.log("Raw output:", output);
  // Normalize line endings and split
  const lines = output.replace(/\r\n/g, '\n').split('\n');
  
  // More aggressive and precise filtering
  const relevantLines = lines.filter(line => {
    const trimmedLine = line.trim();
    
    // Comprehensive noise pattern matching
    const noisePatterns = [
      // Exact matches for system messages
      /^Microsoft Windows \[Version/,
      /^\(c\) Microsoft Corporation/,
      /^C:\\.*>/,
      
      // Docker and system execution patterns
      /docker run/,
      /WINDOWS\\SYSTEM32/,
      /^0;/,
      
      // Terminal and system prefixes
      /^cmd\.exe/,
      /^Server running on port/,
      
      // Empty or whitespace-only lines
      /^\s*$/
    ];
    
    // Check if line matches any noise pattern
    const isNoise = noisePatterns.some(pattern => pattern.test(trimmedLine));
    
    // Keep line if it's not noise and has meaningful content
    return !isNoise && 
           trimmedLine.length > 0 && 
           !trimmedLine.startsWith('\\') && 
           !trimmedLine.includes('TEMP/code-execution-temp');
  });
  
  // Join relevant lines, or return null if no relevant lines
  const result = relevantLines.length > 0 ? relevantLines.join('\n') : null;
  
  console.log("Filtered output:", result);
  return result;
}

// Modified WebSocket message handler
function handleWebSocketMessage(ws, message, clientId) {
  try {
    const data = JSON.parse(message);

    console.log("Received message:", data);
    if (data.type === "execute") {

      processStates.set(clientId, { isRunning: true });
      // Execute code
      const { code, language } = data;
    
      try {
        // Use await or .then() to handle the Promise
        executeCodeService(code, language, (output) => {
          processOutput(output, language, ws);
        })
        .then(({ ptyProcess }) => {
          // Now ptyProcess is available
          if (!ptyProcess) {
            throw new Error("Process initialization failed");
          }
          
          // Store process reference
          processStates.set(clientId, ptyProcess);
    
          // Handle process exit
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
        .catch(error => {
          ws.send(
            JSON.stringify({ type: "error", error: error.toString() })
          );
        });
      } catch (error) {
        ws.send(
          JSON.stringify({ type: "error", error: error.toString() })
        );
      }
    } else if (data.type === "input") {
      const process = processStates.get(clientId);
      if (process) {
        process.write(data.data + "\n"); // Send input to process
    
        // 🔥 Ensure process continues execution
        setTimeout(() => {
          process.write("\r"); // Try forcing execution
        }, 50);
      } else {
        ws.send(JSON.stringify({ type: "error", error: "No active process found." }));
      }
    }
  } catch (error) {
    console.error("Error handling message:", error);
    ws.send(JSON.stringify({ type: "error", error: error.toString() }));
    ws.close(); // Ensure the WebSocket closes on failure
  }
}

// Updated WebSocket server setup
function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    const clientId = Date.now().toString();
    console.log(`Client connected: ${clientId}`);

    ws.on("message", (message) => {
      // No longer pass activeProcesses as a parameter since it's accessible at module level
      handleWebSocketMessage(ws, message, clientId);
    });

    ws.on("close", () => {
      const process = processStates.get(clientId);
      if (process) {
        process.kill(); // Kill the running process
        processStates.delete(clientId);
        console.log(`Process for ${clientId} terminated.`);
      }
    });
  });

  return wss;
}

module.exports = { 
  setupWebSocketServer,
  isWaitingForInput, // Export for testing
  processOutput
};