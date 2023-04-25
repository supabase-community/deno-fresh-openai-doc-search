import { useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { Button } from "../components/Button.tsx";
import type { CreateCompletionResponse } from "openai";

export default function SearchDialog() {
  const [search, setSearch] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<string>("");

  const onSubmit = (e: Event) => {
    e.preventDefault();
    console.log(search);
    setAnswer("");
    setIsLoading(true);

    const query = new URLSearchParams({ query: search });
    const eventSource = new EventSource(`api/vector-search?${query}`);

    function handleError<T>(err: T) {
      setIsLoading(false);
      console.error(err);
    }

    eventSource.addEventListener("error", handleError);
    eventSource.addEventListener("message", (e: MessageEvent) => {
      try {
        setIsLoading(false);

        if (e.data === "[DONE]") {
          eventSource.close();
          return;
        }

        const completionResponse: CreateCompletionResponse = JSON.parse(e.data);
        const text = completionResponse.choices[0].text;

        setAnswer((answer) => answer + text);
      } catch (err) {
        handleError(err);
      }
    });

    setIsLoading(true);
  };

  return (
    <>
      <div class="flex gap-2 w-full">
        <form onSubmit={onSubmit}>
          <input
            name="search"
            value={search}
            // @ts-ignore not sure why complaing
            onInput={(e) => setSearch(e.target?.value ?? "")}
            placeholder="Search"
            disabled={!IS_BROWSER}
            class={`px-3 py-2 bg-white rounded border(gray-500 2) disabled:(opacity-50 cursor-not-allowed)`}
          />
          <Button>Search</Button>
        </form>
      </div>
      <div class="flex gap-2 w-full">
        <p>{isLoading ? "Loading..." : answer}</p>
      </div>
    </>
  );
}
