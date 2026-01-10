# ReUnifyd

**The Unified Creator Dashboard for Cross-Platform Performance Analysis.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Database: SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)

---

##  Project Overview

**ReUnifyd** is a centralized analytics platform designed for content creators who manage multiple channels across various social media platforms. In the current digital landscape, creators often "cross-post" content (e.g., YouTube Shorts, Instagram Reels, and TikToks). 

The problem is **"Tab Fatigue"**: creators must jump between multiple dashboards to manually compare how the exact same video performed across different apps. ReUnifyd aggregates this data into a single, intuitive interface, providing side-by-side comparisons that drive better content strategy.

###  Key Features
* **Unified View:** Access all your YouTube channels from one centralized login.
* **Video-Level Comparisons:** Compare performance metrics (views, watch time, engagement) for the same video across different platforms/channels.
* **Historical Tracking:** Data is stored locally to allow for trend analysis over time.
* **Secure Integration:** Uses industry-standard OAuth 2.0 for all platform connections.

---

##  How It Works (System Logic)

ReUnifyd acts as a bridge between official social media APIs and the creator's personal analytics dashboard. The core logic follows a secure "Fetch-Store-Visualize" cycle.

### Logic Flowchart
You can view the detailed interactive architectural logic here:
<img width="2076" height="1155" alt="mermaid-diagram-2026-01-09-224735" src="https://github.com/user-attachments/assets/484babb5-a6bc-4191-8386-28da67441be5" />


### 🛠 Tech Stack
| Component | Technology |
| :--- | :--- |
| **Frontend** | HTML, CSS, React,Next.js |
| **Backend** |Python/FastAPI |
| **Database** | **SQLite** (FOR TESTING)|
| **Authentication** | OAuth 2.0 (Google/YouTube) |
| **APIs** | YouTube Data API v3 & YouTube Analytics API |

---

##  Data Architecture (SQLite)

We use **SQLite** for its efficiency and portability. The database is structured to ensure that sensitive tokens are encrypted and that video data is normalized for easy comparison.

> **Note:** Even though SQLite is a local file-based database, ReUnifyd implements a strict encryption layer for the `Access_Tokens` table to ensure creator security.

1.  **Users Table:** Stores account information and profile settings.
2.  **Accounts Table:** Stores linked YouTube channel IDs and encrypted OAuth tokens.
3.  **Video_Metrics Table:** Stores view counts, likes, and watch time synced from APIs.
4.  **Comparisons Table:** Logic that links different platform Video IDs to a single "Campaign" or "Project."

---

##  Security & Privacy

ReUnifyd is built with creator privacy as a top priority:
* **Official APIs:** We only use official YouTube APIs. We never ask for your password.
* **Minimal Scopes:** We request "Read-Only" access to analytics. We cannot delete videos or change your channel settings.
* **Local Data Integrity:** Using SQLite ensures that your performance data is handled efficiently and can be backed up or cleared by the user at any time.

