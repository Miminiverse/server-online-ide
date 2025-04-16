FROM base

# Switch to root for setup
USER root

# Create app directory and set permissions
RUN mkdir -p /app && chown executor:executor /app

# Install additional C++ build dependencies
RUN apt-get update && \
    apt-get install -y g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Switch back to executor user
USER executor

WORKDIR /app

CMD ["sh", "-c", "if [ -f /app/code.cpp ]; then g++ /app/code.cpp -o /app/code && /app/code; else echo 'Waiting for C++ code...'; sleep infinity; fi"]