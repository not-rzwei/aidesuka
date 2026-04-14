"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  type AnimeInferenceResult,
  runAnimeAiInference,
} from "@/lib/anime-ai-inference";

export default function DetectorDemo() {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnimeInferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handlePaste(event: ClipboardEvent) {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement)
      ) {
        return;
      }

      const items = event.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (!item.type.startsWith("image/")) {
          continue;
        }

        const pastedFile = item.getAsFile();

        if (!pastedFile) {
          return;
        }

        event.preventDefault();
        void applyFile(
          new File([pastedFile], pastedFile.name || "clipboard-image.png", {
            type: pastedFile.type,
          }),
        );
        return;
      }
    }

    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("paste", handlePaste);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function openPicker() {
    inputRef.current?.click();
  }

  async function applyFile(nextFile: File | null) {
    if (!nextFile) {
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const url = URL.createObjectURL(nextFile);
    const currentRequest = requestRef.current + 1;

    requestRef.current = currentRequest;
    objectUrlRef.current = url;

    setFile(nextFile);
    setPreviewUrl(url);
    setResult(null);
    setError(null);
    setIsAnalyzing(true);

    try {
      const nextResult = await runAnimeAiInference(nextFile);

      if (requestRef.current !== currentRequest) {
        return;
      }

      setResult(nextResult);
    } catch (nextError) {
      if (requestRef.current !== currentRequest) {
        return;
      }

      console.error(nextError);
      setError("読み込みエラー");
    } finally {
      if (requestRef.current === currentRequest) {
        setIsAnalyzing(false);
      }
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    void applyFile(event.target.files?.[0] ?? null);
  }

  function resetDemo() {
    requestRef.current += 1;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }

    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setIsAnalyzing(false);
  }

  const statusTone = result?.label === "ai" ? "text-[#c94f3a]" : "text-[#215a3e]";

  return (
    <section className="flex w-full max-w-2xl flex-col items-center">
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleInputChange}
      />

      <h1 className="text-center font-display text-4xl font-medium tracking-[-0.08em] text-black sm:text-5xl">
        AIですか？
      </h1>

      <button
        type="button"
        onClick={openPicker}
        className="mt-10 flex w-full items-center justify-center border border-dashed border-black/15 bg-white/60 px-6 py-16 transition hover:border-black/30 hover:bg-white/85 sm:py-20"
      >
        {previewUrl ? (
          <div className="relative aspect-[4/5] w-full max-w-sm overflow-hidden">
            <Image
              src={previewUrl}
              alt={file?.name ?? "Selected preview"}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <span className="text-sm text-black/45">upload image / paste</span>
        )}
      </button>

      <div className="mt-8 min-h-10 text-center">
        {isAnalyzing ? (
          <p className="text-base text-black/42">読み込み中...</p>
        ) : error ? (
          <p className="text-base text-[#c94f3a]">{error}</p>
        ) : result ? (
          <div className="space-y-2">
            <p className={`text-2xl font-medium tracking-[-0.05em] ${statusTone}`}>
              {result.label === "ai" ? "そうです" : "たぶん違います"}
            </p>
            <p className="text-sm text-black/42">
              {Math.round(result.confidence * 100)}%
            </p>
          </div>
        ) : null}
      </div>

      {(file || result || error) && (
        <button
          type="button"
          onClick={resetDemo}
          className="mt-8 text-sm text-black/35 transition hover:text-black/60"
        >
          reset
        </button>
      )}
    </section>
  );
}
