# Deploying CodeMind on Vercel with Ollama on your laptop

```
Phone / any browser
        │  HTTPS
        ▼
Vercel (CodeMind: frontend + backend, one Next.js app)
   ├──► Neon (hosted PostgreSQL + pgvector)
   └──► Cloudflare Tunnel ──► your laptop: Caddy gateway (token check) ──► Ollama + GPU
```

The app is reachable from anywhere. AI features work while the laptop is on and running Ollama plus the tunnel. When the laptop is off, the app still loads, saved answers, commits and stats still show, and the System Status page reports the AI as offline.

## 1. Hosted database (Neon)

The database in Docker on your laptop is not reachable from Vercel, so use a hosted one.

1. Create a free project at https://neon.tech (pgvector is supported).
2. Copy the connection string, e.g. `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`.
3. Create the tables once from your laptop:
   ```bash
   DATABASE_URL="<neon url>" npx prisma db push
   ```
   This also enables the `vector` extension.

## 2. Expose Ollama securely from your laptop

Ollama has no authentication, so never expose port 11434 directly. The `remote-ollama/` folder runs a token-checking gateway and a Cloudflare tunnel.

```bash
cp remote-ollama/.env.example remote-ollama/.env
# put a long random OLLAMA_API_KEY in remote-ollama/.env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

docker compose -f remote-ollama/docker-compose.yml up -d
docker logs codemind_tunnel        # copy the https://<random>.trycloudflare.com URL
```

Requests without the token get `401 Unauthorized`.

Quick-tunnel URLs change every time the tunnel restarts. For a permanent URL, create a named tunnel in Cloudflare Zero Trust (public hostname pointing at `http://gateway:8080`), put its token in `CLOUDFLARE_TUNNEL_TOKEN`, and run:

```bash
docker compose -f remote-ollama/docker-compose.yml --profile named up -d gateway tunnel-named
```

## 3. Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel. The framework is detected as Next.js.
2. Set these environment variables in Vercel → Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `OLLAMA_BASE_URL` | Your tunnel URL |
| `OLLAMA_API_KEY` | Same key as in `remote-ollama/.env` |
| `LLM_MODEL` | `qwen2.5-coder:3b-instruct` |
| `EMBEDDING_MODEL` | `nomic-embed-text` |
| `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` |
| `GITHUB_TOKEN` | A valid GitHub personal access token |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | Optional. Enables cloud models in the model switcher. Embeddings still need Ollama, so the tunnel is required either way. |

3. Deploy.
4. **Turn on access protection.** CodeMind has no sign-in, so a public URL lets anyone browse your indexed repositories, index new ones with your GitHub token, and run prompts on your laptop's GPU. In Vercel go to Project → Settings → Deployment Protection and enable **Vercel Authentication** (free; only people you invite to the Vercel project can open the site) or Password Protection.

When the quick-tunnel URL changes, update `OLLAMA_BASE_URL` in Vercel and redeploy, or use a named tunnel.

## Limits to know

- **Function duration.** Indexing runs inside one request. The API route and app pages request up to 300 s (`maxDuration`), the Vercel Hobby limit with Fluid compute. Larger repositories, or a slow laptop or connection, can exceed that, so keep demo repositories small (the indexer caps at 30 files).
- **Latency.** Every model call travels Vercel → Cloudflare → laptop, which adds a little latency on top of inference time.
- **Prometheus metrics.** `/api/metrics` on Vercel reflects a single serverless instance, so use the in-app **AI Metrics** page there (it reads the database). Prometheus and Grafana are meant for the Docker setup.
- **Qdrant** is not needed on Vercel. Retrieval uses pgvector, and System Status shows Qdrant as unavailable there.
