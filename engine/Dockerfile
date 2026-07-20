# Sandbox image for the review engine.
#
# The engine runs two kinds of work inside this container:
#   1. The target repo's test suite (e.g. `python -m pytest -q`) — with the
#      network disabled. Needs Python + pytest.
#   2. The Gate 1 judgment call (`claude -p ...`) — with the network enabled.
#      Needs Node and the Claude Code CLI (`claude`).
#
# Build:   docker build -t review-engine-python:latest engine
# Use:     the engine defaults to this image; override with REVIEW_SANDBOX_IMAGE.
#
# The ANTHROPIC_API_KEY is NOT baked in — it is passed at run time, and only
# into the network-enabled judgment invocation.

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python-is-python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pytest for running the target suite. --break-system-packages is required on
# Debian bookworm's externally-managed Python.
RUN pip3 install --no-cache-dir --break-system-packages pytest

# The Claude Code CLI provides the `claude` command used by the judgment gate.
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /work
