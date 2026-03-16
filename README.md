# FaceFree Customer Info Backend

API server for customer registration and photo management. Handles face/body photo uploads to Google Cloud Storage and customer data in Firestore.

## Part of FaceFree Platform
See the [main README](../../README.md) for full project documentation.

## Tech Stack
- Node.js, Express.js
- Google Cloud Storage
- Google Cloud Firestore

## Setup

```bash
git clone https://github.com/claud0604/03-06-01-cust-info-back.git
cd 02-backend
npm install
cp .env.example .env
# Configure environment variables
node server.js
```

## Environment Variables
| Variable | Description |
|----------|-------------|
| PORT | Server port (default: 3061) |
| GCS_BUCKET | Google Cloud Storage bucket name |
| GCS_KEY_PATH | Path to service account key JSON |

## Production Deployment
Deployed on Google Compute Engine with PM2.
```bash
gcloud compute ssh apl-backend-server --zone=asia-northeast3-a
cd /home/kimvstiger/apps/custinfo-backend/ && git pull && npm install && pm2 restart custinfo-backend
```
