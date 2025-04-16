FROM node:20.12.2-bookworm

# Install build tools and Docker CLI
RUN apt-get update && \
    apt-get install -y \
    python3 \
    make \
    g++ \
    ca-certificates \
    curl \
    gnupg \
    lsb-release && \
    # Create python symlink for node-gyp
    ln -s /usr/bin/python3 /usr/bin/python && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m appuser && mkdir -p /usr/src/app && chown -R appuser:appuser /usr/src/app
USER appuser

WORKDIR /usr/src/app

# Install dependencies with node-pty rebuild
COPY --chown=appuser:appuser package*.json ./
RUN npm install --build-from-source
RUN npm rebuild node-pty --build-from-source

COPY --chown=appuser:appuser . .

EXPOSE 8010
CMD ["node", "server.js"]