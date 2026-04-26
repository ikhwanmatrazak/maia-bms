"use client";
import { useEffect } from "react";

export default function ProjectsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Projects page error:", error); }, [error]);
  return (
    <div className="p-6">
      <div className="bg-danger-50 border border-danger-200 rounded-xl p-4">
        <p className="font-semibold text-danger mb-2">Debug Error Info:</p>
        <p className="text-sm font-mono bg-danger-100 p-2 rounded">{error.message}</p>
        <pre className="text-xs mt-2 overflow-auto max-h-60 bg-default-100 p-2 rounded">{error.stack}</pre>
        <button onClick={reset} className="mt-3 px-3 py-1 bg-primary text-white rounded text-sm">Try again</button>
      </div>
    </div>
  );
}
