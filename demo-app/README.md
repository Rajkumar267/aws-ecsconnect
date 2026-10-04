# Amazon ECS Service Connect Live-Demo Frontend & Backend

A clean, interactive live-demo dashboard built for hackathon presentations to demonstrate **Amazon ECS Service Connect** service-to-service traffic and resilient service discovery.

---

## Architecture Overview

```
[ Browser / UI (React + Vite) ]
          ↓  (HTTP REST)
[ Demo Backend (Node.js/Express :3001) ]
          ↓  (HTTP REST)
[ order-service (:8080) on ECS / Fargate ]
          │
          ├── (ECS Service Connect Discovery: `product-service:8081`) ──► [ product-service (:8081) ]
          │                                                                     │ (JPA)
          │                                                                     ▼
          │                                                          [ RDS: product_db ]
          │
          └── (ECS Service Connect Discovery: `payment-service:8082`) ──► [ payment-service (:8082) ]
                                                                                │ (JPA)
                                                                                ▼
                                                                     [ RDS: payment_db ]
```

### AWS Deployment Details
- **Region:** `eu-north-1` (Stockholm)
- **ECS Cluster:** `ecs-service-connect-demo`
- **Cloud Map Namespace:** `microservices`
- **Service Connect Logical DNS Endpoints:**
  - `order-service:8080`
  - `product-service:8081`
  - `payment-service:8082`
- **Database:** PostgreSQL on Amazon RDS (`microservices-postgres`)

---

## Features

1. **Section 1: Microservices Status Dashboard**
   - Displays real-time status of `order-service`, `product-service`, and `payment-service` directly from the AWS ECS API.
   - Shows active Task IDs, dynamic Private IPs (`172.31.x.x`), and Service Connect logical names.

2. **Section 2: Visual Service Flow Diagram**
   - Interactive pipeline illustrating the communication route:
     `Demo Backend ➔ order-service:8080 ➔ Service Connect (product-service:8081 & payment-service:8082)`.

3. **Section 3: Product Catalog & Creation**
   - View real products stored in `product_db` via ECS.
   - Create new products directly against the live `product-service`.

4. **Section 4: Place Order Workflow**
   - Send order requests to `order-service:8080`.
   - Visual step checklist showing `order-service` calling `product-service:8081` and `payment-service:8082` over Service Connect.
   - Displays generated Order ID and Payment ID with status `SUCCESS`.

5. **Section 5: Real ECS Task Replacement Demonstration (The Core Pitch)**
   - Click **"Simulate Task Failure / Replace Product Task"**.
   - Demo backend calls AWS ECS `StopTask` on the current `product-service` task.
   - ECS launches a brand new replacement task with a **different private IP**.
   - Displays a side-by-side comparison:
     - **Old Task:** Stopped, IP Dead.
     - **New Task:** Running, New IP Assigned.
     - **Logical Name:** `product-service:8081` unchanged.

6. **Section 6: Post-Replacement Verification**
   - Immediately place a new order after replacement.
   - Proves `order-service` routes seamlessly to the new task without configuration or code changes.

---

## How to Run the Demo App

### Prerequisites
- Node.js (v18+)
- AWS CLI configured with credentials for `eu-north-1`.

### Option A: Run Unified Backend + Built Frontend (Recommended)
The backend serves both the API and the pre-built React frontend on port `3001`:

```powershell
cd "d:\3-1\courses\AWS\AWS WORKPLACE STS\demo-app\server"
node server.js
```
Open your browser to: **`http://localhost:3001`**

---

### Option B: Run with Vite Dev Server (Hot Reloading)

1. Start Demo Backend:
```powershell
cd "d:\3-1\courses\AWS\AWS WORKPLACE STS\demo-app\server"
node server.js
```

2. In a second terminal, start Vite Frontend:
```powershell
cd "d:\3-1\courses\AWS\AWS WORKPLACE STS\demo-app\client"
npm run dev
```
Open your browser to: **`http://localhost:5173`**

---

## Recommended Live Demo Presentation Script (3-5 Minutes)

1. **Introduction:**
   - Open `http://localhost:3001`.
   - Point to **Section 1**: Show all 3 microservices running in Fargate with real Task IDs and private IPs in the `microservices` namespace.
   - Point to **Section 2**: Explain that microservices talk using logical DNS names (`product-service:8081` and `payment-service:8082`) injected by the AWS Service Connect Envoy sidecar proxy.

2. **Demonstrate Normal Order Flow:**
   - In **Section 4**, select a product and click **"Place Order via Service Connect"**.
   - Show the 3-step checkmarks: Order received ➔ Product validated ➔ Payment processed.
   - Point out that Order Service called both downstream services using their Service Connect DNS names.

3. **Demonstrate Resilient Service Discovery (The "Aha!" Moment):**
   - Scroll to **Section 5**.
   - Note the current `product-service` Task ID and Private IP.
   - Click **"Simulate Task Failure / Replace Product Task"**.
   - Explain what is happening in real-time:
     - Old container is stopped.
     - ECS Fargate scheduler provisions a new replacement task.
     - AWS Cloud Map & Envoy proxy update endpoint tables automatically.
   - Once completed, highlight the side-by-side card:
     - Old Task is **STOPPED** and its IP is dead.
     - New Task is **RUNNING** with a completely new IP address.
     - The Service Connect endpoint `product-service:8081` remains identical.

4. **Verification:**
   - In **Section 6**, click **"Verify Order on New Task"**.
   - The order succeeds immediately!
   - Conclude: *"Notice that Order Service required no restart, no DNS cache flushing, and no configuration change. AWS ECS Service Connect handled traffic redirection automatically."*
