import { Head } from "$fresh/runtime.ts";
import SearchDialog from "../islands/SearchDialog.tsx";
import Counter from "../islands/SearchDialog.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>Deno Fresh OpenAI Vector Search</title>
      </Head>
      <div class="p-4 mx-auto max-w-screen-md">
        <h1 class="text-3xl">Deno Fresh OpenAI Vector Search</h1>
        <SearchDialog />
      </div>
    </>
  );
}
