# Toolbox — agent execution environment
# Provides bash, Python, Node.js, and CLI tools for agent tool calls.
# Runs as a sidecar container; the unified worker uses `docker exec` to run commands.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget jq git python3 python3-pip python3-venv \
    ripgrep fd-find ca-certificates gnupg \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/*

# Python venv for agent scripts
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir requests feedparser beautifulsoup4 html2text

COPY init-workspace.sh /usr/local/bin/init-workspace.sh
RUN chmod +x /usr/local/bin/init-workspace.sh

RUN useradd -m -s /bin/bash agent
USER agent
WORKDIR /workspace
CMD ["/bin/bash", "-c", "/usr/local/bin/init-workspace.sh && sleep infinity"]
