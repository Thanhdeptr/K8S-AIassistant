# k8s-AIassistant

AI-powered Kubernetes management plugin for Rancher UI.

## Components
- **Rancher Backend** (Port 8443): Official Rancher server
- **MCP Server** (Port 3000): Kubernetes tools via MCP protocol  
- **Plugin Backend** (Port 8055): AI chat backend (NOT main Rancher backend)
- **Frontend** (Port 8005): Vue.js Rancher UI Plugin

## Prerequisites
- Rancher Server (Port 8443)
- Docker & Docker Compose
- kubeconfig file
- Ollama/OpenAI endpoint
- ngrok (for HTTPS tunnel)

## Quick Start
1. Set permissions:
```bash
export UID=$(id -u) && export GID=$(id -g)
chmod 644 ~/.kube/config
```

2. Start services:
```bash
docker compose up -d
```

3. Start frontend:
```bash
cd ui-plugin-example
docker build -t rancher-ui-frontend .
docker run -d --name rancher-ui-frontend -p 8005:8005 rancher-ui-frontend
```

## Important Notes

### Backend Architecture
- **Rancher Backend** (Port 8443): Official Rancher server
- **Plugin Backend** (Port 8055): AI chat backend only
- **Frontend** (Port 8005): Rancher UI Plugin

### ngrok Tunnel
Plugin backend uses ngrok for HTTPS tunnel:
```bash
ngrok http 8055
```
**⚠️ Important**: ngrok URLs change on restart. Update `myCustomPage.vue` with new URL.

### Current ngrok URL
- Frontend calls: `https://46348f0ab8fa.ngrok-free.app/api/chat`
- Update in: `ui-plugin-example/pkg/top-level-product/pages/myCustomPage.vue`

## Architecture
```
Frontend (8005) → Rancher Backend (8443) [Kubernetes data]
                → Plugin Backend (8055) → MCP Server (3000) → Kubernetes
                → Ollama (11434) [AI processing]
```

## Files
- MCP server: `mcp-server-kubernetes/`
- Plugin backend: `ui-plugin-example/pkg/top-level-product/pages/server.js`
- Frontend: `ui-plugin-example/pkg/top-level-product/pages/myCustomPage.vue`
- Dockerfile: `ui-plugin-example/Dockerfile`

## Demo
![Demo Screenshot](image/Screenshot%202025-09-15%20154543.png)
