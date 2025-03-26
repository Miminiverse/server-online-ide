const WebSocket = require("ws");
const { executeCodeService } = require("./executeCode");


// Track active processes - define this at the module level
const activeProcesses = new Map();

/**
 * Function to detect if output indicates code is waiting for user input
 * @param {string} output - The program output to analyze
 * @param {string} language - The programming language being executed
 * @returns {boolean} - Whether input is required
 */
function isWaitingForInput(output, language) {
  // Remove any trailing cursor characters
  const cleanOutput = output.replace(/[\r\n]*$/, '').trim();
  
  if (!cleanOutput) return false;
  
  // Common patterns that indicate input request across languages
  const commonPatterns = [
    /input\s*\(.*\)\s*$/i,         // Python's input() function
    /raw_input\s*\(.*\)\s*$/i,      // Python 2's raw_input() function
    /cin\s*>>\s*$/,                // C++ cin
    /scanf\s*\(.*\)\s*;?\s*$/,     // C/C++ scanf
    /readline\s*\(\)\s*$/,         // Various languages readline
    /read\s*\(.*\)\s*$/,           // Various read functions
    /prompt\s*\(.*\)\s*$/,         // JavaScript prompt
    /gets\s*\(.*\)\s*$/,           // Ruby gets
    /fgets\s*\(.*\)\s*$/,          // C fgets
    /console\.readLine.*\(\)/,     // Java/Kotlin console.readLine
    /\w+\s*=\s*scanner\.next.*/,   // Java Scanner pattern
  ];
  
  // Patterns that typically indicate a prompt (ending with : or > or ? without line break)
  const promptPatterns = [
    /[:>?]\s*$/,                   // Ends with :, >, or ? followed by optional whitespace
    /(?:enter|input|type|provide).*[:>?]?\s*$/i, // Words like "enter", "input", etc.
    /(?:name|value|number|string|text|data).*[:>?]?\s*$/i // Words indicating what to input
  ];
  
  // Language-specific detection
  if (language === 'python') {
    // Python commonly uses input() or ends with a prompt character
    return commonPatterns.some(pattern => pattern.test(cleanOutput)) || 
           promptPatterns.some(pattern => pattern.test(cleanOutput));
  } 
  else if (language === 'cpp') {
    // C++ commonly uses cin >> or std::cin or ends with a prompt character
    return /cin|std::cin|scanf|gets|getline/.test(cleanOutput) ||
           promptPatterns.some(pattern => pattern.test(cleanOutput));
  }
  else if (language === 'javascript') {
    // JavaScript can use prompt() or readline or other custom methods
    return /prompt|readline|question/.test(cleanOutput) ||
           promptPatterns.some(pattern => pattern.test(cleanOutput));
  }
  
  // Generic detection for all languages as fallback
  return commonPatterns.some(pattern => pattern.test(cleanOutput)) || 
         promptPatterns.some(pattern => pattern.test(cleanOutput));
}

/**
 * Enhanced output filter that also detects input requirements
 * @param {string} output - Raw output from the process
 * @param {string} language - The programming language
 * @param {WebSocket} ws - WebSocket connection
 */
function processOutput(output, language, ws) {
  console.log("Processing output:", output);
  
  // First filter unwanted system messages
  const filteredOutput = filterOutput(output);
  
  console.log("Filtered to:", filteredOutput);
  
  if (filteredOutput) {
    // Send the filtered output to the client
    ws.send(JSON.stringify({ type: "output", data: filteredOutput }));
    
    // Check if the program is waiting for input
    if (isWaitingForInput(filteredOutput, language)) {
      console.log("Input required detected");
      // Notify the frontend that input is required
      ws.send(JSON.stringify({ 
        type: "inputRequired",
        prompt: filteredOutput
      }));
    }
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
          activeProcesses.set(clientId, ptyProcess);
    
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
            activeProcesses.delete(clientId);
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
      const process = activeProcesses.get(clientId);
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
      const process = activeProcesses.get(clientId);
      if (process) {
        process.kill(); // Kill the running process
        activeProcesses.delete(clientId);
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