This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started      

cd backend
.\.venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

cd frontend
npm run dev

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## GitHub Pages (this repo)

The workflow [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml) builds a **static** site (`STATIC_EXPORT=1`) with `basePath` set to the repository name.

1. **Repository → Settings → Pages**: set **Source** to **GitHub Actions**.
2. If you **rename the repo**, update `NEXT_PUBLIC_BASE_PATH` in that workflow to match the new name (no leading/trailing slashes in the env value).
3. **API & CORS**: Pages only hosts the frontend. Deploy the FastAPI app elsewhere and add a repository variable **`NEXT_PUBLIC_API_URL`** (e.g. `https://your-api.example.com`) so the browser can call it. On the backend, set **`CORS_ORIGINS`** to include your Pages origin, e.g. `https://YOUR_USER.github.io` (GitHub sends the `Origin` header without the repo path; path-specific CORS is not required for simple `fetch` from that host).
