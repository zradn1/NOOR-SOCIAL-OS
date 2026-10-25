"use client";

import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-canvas px-4 text-fg">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-medium">NOOR SOCIAL OS hit an unexpected error</h1>
          <p className="text-sm text-fg-muted">Nothing was lost. Reload the page or try again in a moment.</p>
          {error.digest ? <p className="font-mono text-xs text-fg-faint">Reference: {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-gold-400 px-4 py-2 text-sm font-medium text-gold-ink hover:bg-gold-300"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
