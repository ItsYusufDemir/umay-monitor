<div align="center">

<img src="docs/images/logo.png" alt="Umay Monitor" width="300">

### Lightweight Server Monitoring with Real-Time Metrics, Auto-Recovery & Backup Management

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![.NET](https://img.shields.io/badge/.NET-8.0-purple.svg)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)

*A simple, lightweight alternative to Nagios and Zabbix for small-to-medium infrastructures.*

**🚀 Agent installs in under 30 seconds • 💨 Agent uses only ~1% CPU & ~40MB RAM**

[Screenshots](#-screenshots) • [Features](#-features) • [Installation](#-installation) • [Contributing](#-contributing)

</div>

---

## 📸 Screenshots

<div align="center">
  <img src="docs/images/1-Dashboard.png" alt="Dashboard" width="80%">
  <p><em>Real-time Dashboard Overview</em></p>
</div>

<details>
<summary>📷 More Screenshots</summary>

<br>

<table>
<tr>
<td width="50%">
<img src="docs/images/2-Dashboard.png" alt="Dashboard Metrics" width="100%">
<p align="center"><em>Detailed Metrics View</em></p>
</td>
<td width="50%">
<img src="docs/images/notifications.png" alt="Notifications" width="100%">
<p align="center"><em>Alert Notifications</em></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/images/services.png" alt="Services" width="100%">
<p align="center"><em>Service Management</em></p>
</td>
<td width="50%">
<img src="docs/images/settings.png" alt="Settings" width="100%">
<p align="center"><em>Settings & Configuration</em></p>
</td>
</tr>
<tr>
<td colspan="2">
<img src="docs/images/agent-installation.png" alt="Agent Installation" width="100%">
<p align="center"><em>One-Liner Agent Installation</em></p>
</td>
</tr>
</table>

</details>

<!-- 
## 📺 Demo

[![Umay Monitor Demo](https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg)](https://www.youtube.com/watch?v=VIDEO_ID)

> Click to watch the demo video
-->

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 📊 Real-Time Monitoring
- CPU, Memory, Disk I/O & Network traffic
- Live updates via SignalR & WebSockets
- Multi-server centralized dashboard
- Interactive charts with metric history

</td>
<td width="50%">

### 🔔 Alerts & Telegram Notifications
- Customizable threshold rules (CPU > 90%, etc.)
- Telegram bot integration
- In-app real-time alert notifications
- Alert history & acknowledgment

</td>
</tr>
<tr>
<td width="50%">

### ⚙️ Process & Service Management
- Live process monitoring with resource usage
- Systemd service restart & status tracking
- Watchlist for critical services/processes
- Service auto-restart when configured

</td>
<td width="50%">

### 💾 Backup Management
- Automated Cron-based scheduling
- Secure [Restic](https://restic.net/) integration
- SFTP destination with encrypted credentials
- Backup logs & integrity verification

</td>
</tr>
<tr>
<td width="50%">

### 🖥️ Agent Management
- One-liner curl deployment command
- Auto-generated secure tokens (BCrypt hashed)
- Server hardware & OS info display
- Real-time online/offline status

</td>
<td width="50%">

### 🔐 Security
- JWT-based API & SignalR authentication
- Secure agent token registration
- AES encrypted backup credentials
- CORS configured for production

</td>
</tr>
</table>

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 |
| **Backend** | ASP.NET Core 8.0 |
| **Agent** | Python 3 |
| **Database** | PostgreSQL 16 |
| **Deployment** | Docker & Docker Compose |

---

## 🚀 Installation

### Prerequisites

- Docker & Docker Compose installed
- Git

### Quick Start

```bash
git clone https://github.com/ItsYusufDemir/umay-monitor.git
cd umay-monitor
./install.sh
```

The interactive installer will guide you through the setup:

<details>
<summary><b>🏠 Option 1: Localhost Mode</b></summary>

Perfect for local development or testing.

- Dashboard: `http://localhost:3000`
- API: `http://localhost:5123`
- No additional configuration needed
- Start monitoring immediately!

</details>

<details>
<summary><b>🌐 Option 2: Domain Mode</b></summary>

For production deployments with custom domains.

- Uses HTTPS with your domain
- Requires reverse proxy (Nginx/Apache)
- SSL termination handled by your proxy

**After installation, configure your reverse proxy:**
```
Dashboard domain → http://localhost:3000
API domain       → http://localhost:5123
```

</details>

---

## 📋 Management Commands

```bash
# View live logs
docker compose logs -f

# Stop all services
docker compose down

# Restart services
docker compose restart

# Update to latest version
git pull && docker compose up -d --build
```

---

<!-- 
## 📖 Documentation

Documentation coming soon!
-->

## 🤝 Contributing

Contributions are welcome! Feel free to:

- 🐛 Report bugs
- 💡 Suggest features
- 🔧 Submit pull requests

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

### 🏛️ About the Name

*Umay is inspired by **Umay Ana**, a protective figure in Turkic mythology.*  
*This project uses the name respectfully as a symbol of protection and guardianship.*

---

### 👨‍💻 Team

**Marmara University - Computer Engineering**  
*Engineering Project*

<table>
<tr>
<td align="center">
<a href="https://github.com/yasinkucukk">
<img src="https://github.com/yasinkucukk.png" width="100px;" alt="Yasin Küçük"/><br />
<sub><b>Yasin Küçük</b></sub>
</a>
</td>
<td align="center">
<a href="https://github.com/ItsYusufDemir">
<img src="https://github.com/ItsYusufDemir.png" width="100px;" alt="Yusuf Demir"/><br />
<sub><b>Yusuf Demir</b></sub>
</a>
</td>
<td align="center">
<a href="https://github.com/yusufdmn">
<img src="https://github.com/yusufdmn.png" width="100px;" alt="Yusuf Duman"/><br />
<sub><b>Yusuf Duman</b></sub>
</a>
</td>
</tr>
</table>

*Supervisor: Assoc. Prof. Ömer Korçak*

---

⭐ Star this repo if you find it useful!

</div>
