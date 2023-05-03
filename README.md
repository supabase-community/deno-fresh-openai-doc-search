# deno-fresh-openai-doc-search

Template for building your own custom ChatGPT style doc search powered by Fresh,
Deno, OpenAI, and Supabase.

## Setup

```bash
cp .env.example .env
```

## Run locally

Start the project:

```bash
supabase start
deno task embeddings
deno task start
```

This will watch the project directory and restart as necessary.

## Deploy

### Push local migrations to Supabase

1. [Create a new project](https://app.supabase.com/projects) on Supabase
2. Link your project: `supabase link --project-ref=your-project-ref`
3. Push up migration: `supabase db push`

## Setup GitHub Action

We're using a [GitHub Action](./.github/workflows/generate-embeddings.yaml) to
generate the embeddings whenever we merge into the `main` branch.

1. Get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your
   [Supabase Studio](https://app.supabase.com/project/_/settings/api) and set
   them as Actions secrets in GitHub.
2. Set `OPENAI_KEY` as Actions secrets in GitHub.
3. Push or merge into `main` to kick off the GitHub action.
