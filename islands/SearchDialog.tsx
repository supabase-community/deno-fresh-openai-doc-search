import { useRef, useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { Button } from "../components/Button.tsx";
import { SSE } from "sse.js";
import type { CreateCompletionResponse } from "openai";

export default function SearchDialog() {
  const [search, setSearch] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);

  // @ts-ignore TODO: how to type this?
  const onSubmit = (e) => {
    e.preventDefault();
    setSearch(inputRef.current!.value);
    console.log(search);
    setAnswer("");
    setIsLoading(true);

    const eventSource = new SSE(`api/vector-search`, {
      headers: {
        "Content-Type": "application/json",
      },
      payload: JSON.stringify({ query: search }),
    });

    function handleError<T>(err: T) {
      setIsLoading(false);
      console.error(err);
    }

    eventSource.addEventListener("error", handleError);
    eventSource.addEventListener("message", (e: any) => {
      try {
        setIsLoading(false);

        if (e.data === "[DONE]") {
          return;
        }

        const completionResponse: CreateCompletionResponse = JSON.parse(e.data);
        const text = completionResponse.choices[0].text;

        setAnswer((answer) => answer + text);
      } catch (err) {
        handleError(err);
      }
    });

    eventSource.stream();

    setIsLoading(true);
  };

  return (
    <>
      <div class="flex gap-2 w-full">
        <form onSubmit={onSubmit}>
          <input
            name="search"
            ref={inputRef}
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
