import { useSignal } from "@preact/signals";
import { useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import type { CreateCompletionResponse } from "openai";

export default function SearchDialog() {
  const isLoading = useSignal(false);
  const answer = useSignal("");

  const inputRef = useRef<HTMLInputElement>(null);

  const onSubmit = (e: Event) => {
    e.preventDefault();
    answer.value = "";
    isLoading.value = true;

    const query = new URLSearchParams({ query: inputRef.current!.value });
    const eventSource = new EventSource(`api/vector-search?${query}`);

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
      <form onSubmit={onSubmit} class="flex gap-2 w-full mb-4">
        <input
          name="search"
          ref={inputRef}
          placeholder="Search"
          disabled={!IS_BROWSER}
          class={`flex-1 px-4 py-2 bg-white rounded-md border-1 border-gray-300 hover:border-green-400 transition duration-300 outline-none disabled:(opacity-50 cursor-not-allowed)`}
        />
        <button
          disabled={!IS_BROWSER}
          class="px-4 py-2 rounded-md text-white border-1 border-slate-700/10 bg-gradient-to-r from-green-400 to-blue-500 hover:to-green-700 transition duration-300"
        >
          Search
        </button>
      </form>
      <p>{isLoading.value ? "Loading..." : answer}</p>
    </>
  );
}
