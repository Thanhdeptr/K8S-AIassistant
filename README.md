# k8s-AIassistant

A minimal setup to run a Kubernetes MCP server and a UI Plugin backend with Docker Compose.

## Overview
- MCP Server (`mcp-server-kubernetes`)
  - Exposes an HTTP SSE transport (Server-Sent Events) for MCP on port 3000.
  - Talks to your Kubernetes cluster using your kubeconfig.
- UI Plugin Backend (`ui-plugin-example/pkg/top-level-product`)
  - Node/Express service on port 8055.
  - Connects to an Ollama-compatible OpenAI endpoint and the MCP server.

## Prerequisites
- Docker and Docker Compose
- A valid kubeconfig on the host (e.g. `/home/<user>/.kube/config`)
- An accessible Ollama/OpenAI-compatible endpoint (e.g. `http://192.168.10.32:11434/v1`)

## Quick Start
1. Set host user and group for the container to read your kubeconfig:
```bash
export UID=$(id -u)
export GID=$(id -g)
chmod 644 /home/<user>/.kube/config
```
2. Build and start services:
```bash
docker compose build
docker compose up -d
```
3. Verify:
- MCP SSE: `curl http://localhost:3000/sse`
- UI Plugin: `curl http://localhost:8055/health`

## Configuration
- Defined in `docker-compose.yml`.
- Service: `mcp` (port 3000)
  - Environment:
    - `ENABLE_UNSAFE_SSE_TRANSPORT=true`
    - `HOST=0.0.0.0`
    - `PORT=3000`
    - `KUBECONFIG_PATH=/kube/config`
  - Volume: bind-mount host kubeconfig `:/kube/config:ro`
  - User: `${UID}:${GID}` (set from host) to avoid permission issues
- Service: `ui-plugin` (port 8055)
  - Environment:
    - `MCP_BASE=http://mcp:3000` (service name inside the compose network)
    - `OLLAMA_BASE=http://192.168.10.32:11434/v1`
    - `MODEL_NAME=gpt-oss:20b`

Adjust `OLLAMA_BASE`, `MODEL_NAME`, kubeconfig path, and ports to match your environment.

## Troubleshooting
- Permission denied reading kubeconfig (EACCES):
  - Ensure `chmod 644 /home/<user>/.kube/config` on the host
  - Export `UID`/`GID` before `docker compose up`
  - If SELinux is enforcing, try adding `:Z` to the bind mount (e.g. `:/kube/config:ro,Z`)
- Network access to Ollama or Kubernetes API:
  - Verify the host/IP is reachable from the container

## Project Layout
- MCP server source: `mcp-server-kubernetes/`
- UI plugin backend: `ui-plugin-example/pkg/top-level-product/pages/server.js`
- UI plugin Dockerfile: `ui-plugin-example/pkg/top-level-product/Dockerfile`
