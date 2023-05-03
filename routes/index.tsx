import { Head } from "$fresh/runtime.ts";
import SearchDialog from "@/islands/SearchDialog.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>Deno Fresh OpenAI Vector Search</title>
        <meta
          name="description"
          content="Template for building your own custom ChatGPT style doc search powered
          by Fresh, Deno, OpenAI, and Supabase"
        />
      </Head>
      <div class="p-4 mx-auto max-w-screen-md font-mono">
        <h1 class="text-3xl mb-4">Deno Fresh OpenAI Vector Search</h1>
        <SearchDialog />
      </div>
    </>
  );
}
