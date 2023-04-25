import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { Button } from "../components/Button.tsx";
import type { CreateCompletionResponse } from "openai";

export default function SearchDialog() {
  const search = useSignal("");
  const isLoading = useSignal(false);
  const answer = useSignal("");

  const inputRef = useRef<HTMLInputElement>(null);

  const onSubmit = (e: Event) => {
    e.preventDefault();
    console.log(search.value);
    answer.value = "";
    isLoading.value = true;

    const eventSource = new SSE(`api/vector-search`, {
      headers: {
        "Content-Type": "application/json",
      },
      payload: JSON.stringify({ query: search.value }),
    });

    function handleError<T>(err: T) {
      isLoading.value = false;
      console.error(err);
    }

    eventSource.addEventListener("error", handleError);
    eventSource.addEventListener("message", (e: MessageEvent) => {
      try {
        isLoading.value = false;

        if (e.data === "[DONE]") {
          eventSource.close();
          return;
        }

        const completionResponse: CreateCompletionResponse = JSON.parse(e.data);
        const text = completionResponse.choices[0].text;

        answer.value += text;
      } catch (err) {
        handleError(err);
      }
    });

    isLoading.value = true;
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
        <p>{isLoading.value ? "Loading..." : answer}</p>
      </div>
    </>
  );
}
