# Running NexusFlow

## Prerequisites
- Node 18+
- A MongoDB instance (local `mongod` or Atlas connection string)
- Expo CLI (`npm i -g expo` optional; `npx expo` works)

## 1. Server
```bash
cd server
cp .env.example .env        # set MONGO_URI, JWT_SECRET, (optional) OPENAI_API_KEY
npm install
npm run dev                 # starts on http://localhost:4000
```

## 2. Client
```bash
cd client
cp .env.example .env        # points at https://nexusflow-nxeg.onrender.com by default
npm install
npx expo start
```
Open in Expo Go or a simulator. Log in with any email/password (dev auth issues a JWT).

## Notes
- Override `EXPO_PUBLIC_API_URL` only if you want to test against a different backend.
- The AI orchestrator runs in **mock mode** if `OPENAI_API_KEY` is unset, so the chat path works offline.
