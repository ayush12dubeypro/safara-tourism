# Safara Tourism

## One-time setup

1. Create a local env file:

```powershell
Copy-Item .env.example .env.local
```

2. Open `.env.local`.

If you want live Hugging Face responses, add your own token.
If you leave `HF_TOKEN` empty, the chatbot still runs in local fallback mode.

```env
HF_TOKEN=
PORT=3001
```

## Start commands

Run both website and chatbot:

```powershell
npm start
```

Run only the website:

```powershell
npm run site
```

Run only the chatbot:

```powershell
npm run chat
```

## URLs

- Website: `http://127.0.0.1:3000`
- Chatbot: `http://127.0.0.1:3001`
- Chatbot status: `http://127.0.0.1:3001/api/status`

## Notes

- `chatbot-server.mjs` automatically loads `.env.local` and `.env`
- You can safely share the project without your token as long as `.env.local` does not contain a real key
- the chatbot already uses a supported default Hugging Face model, so you do not need to set `HF_MODEL`
- If `/api/status` shows `mode: "huggingface"`, the chatbot is using the live Hugging Face model
- If `/api/status` shows `mode: "local"`, the chatbot is running without an API key
- If port `3001` is already in use, stop the old process before restarting
