const WebSocket = require("ws");
const { executeCodeService } = require("./executeCode");

// Track active processes
const activeProcesses = new Map();

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    const clientId = Date.now().toString();
    console.log(`Client connected: ${clientId}`);
    
    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.type === "execute") {
          // Execute code
          const { code, language } = data;
          
          try {
            const { ptyProcess } = await executeCodeService(
              code,
              language,
              (output) => {
                // Send output to client
                ws.send(JSON.stringify({ type: "output", data: output }));
              }
            );
            
            // Store process reference
            activeProcesses.set(clientId, ptyProcess);
            
            // Handle process exit
            ptyProcess.on("exit", (exitCode) => {
              ws.send(JSON.stringify({ 
                type: "status", 
                status: "finished", 
                exitCode 
              }));
              activeProcesses.delete(clientId);
            });
            
          } catch (error) {
            ws.send(JSON.stringify({ type: "error", error: error.toString() }));
          }
        } 
        else if (data.type === "input") {
          // Send input to the running process
          const process = activeProcesses.get(clientId);
          if (process) {
            process.write(data.data + "\n");
          }
        }
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });
    
    ws.on("close", () => {
      // Clean up when client disconnects
      const process = activeProcesses.get(clientId);
      if (process) {
        process.kill();
        activeProcesses.delete(clientId);
      }
      console.log(`Client disconnected: ${clientId}`);
    });
  });
  
  return wss;
}

module.exports = { setupWebSocketServer };