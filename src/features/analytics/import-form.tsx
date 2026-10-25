"use client";

import { Download, FileUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { importTemplate, parseMetricsImport, IMPORT_MAX_ROWS } from "@/lib/analytics/csv";
import { METRIC_LABEL } from "@/lib/platforms/metrics";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { formatBytes, pluralize } from "@/lib/utils/format";
import { importMetricsAction } from "@/server/actions/analytics";

const MAX_BYTES = 1_000_000;

export type ImportableAccount = { id: string; platform: Platform; displayName: string; latestMetricDate: string | null };

export function MetricsImportForm({ slug, accounts, today }: { slug: string; accounts: ImportableAccount[]; today: string }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<{ name: string; size: number; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rows: number; warnings: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const account = accounts.find((a) => a.id === accountId);

  // The preview runs the same parser the server uses; the server re-checks everything.
  const preview = useMemo(() => (file && account ? parseMetricsImport(file.text, account.platform, today) : null), [file, account, today]);
  const range = preview?.rows.length
    ? { from: preview.rows.reduce((m, r) => (r.metricDate < m ? r.metricDate : m), preview.rows[0]!.metricDate), to: preview.rows.reduce((m, r) => (r.metricDate > m ? r.metricDate : m), preview.rows[0]!.metricDate) }
    : null;
  const canSubmit = Boolean(account && file && preview && preview.rows.length && !preview.errors.length);

  async function onFile(input: HTMLInputElement) {
    setDone(null);
    setServerError(null);
    const picked = input.files?.[0];
    if (!picked) return setFile(null);
    if (picked.size > MAX_BYTES) {
      setFile(null);
      setFileError(`That file is ${formatBytes(picked.size)}. Import at most 1 MB at a time.`);
      return;
    }
    setFileError(null);
    setFile({ name: picked.name, size: picked.size, text: await picked.text() });
  }

  // A file chosen before the page finished loading never fired onChange.
  useEffect(() => {
    if (fileInput.current?.files?.length) void onFile(fileInput.current);
  }, []);

  function downloadTemplate() {
    if (!account) return;
    const blob = new Blob([importTemplate(account.platform)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${account.platform}-metrics-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function submit() {
    if (!file || !account) return;
    setServerError(null);
    startTransition(async () => {
      const result = await importMetricsAction(slug, { accountId: account.id, csv: file.text });
      if (!result.ok) {
        setServerError(result.error.message);
        return;
      }
      setDone({ rows: result.data.rows, warnings: result.data.warnings });
      setFile(null);
      toast.show({ tone: "success", title: `Imported ${pluralize(result.data.rows, "day")} for ${account.displayName}` });
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="import-account" label="Account" hint={account?.latestMetricDate ? `Imported through ${account.latestMetricDate}` : "No imports yet"}>
          <Select
            id="import-account"
            value={accountId}
            aria-describedby={describedBy("import-account", { hint: true })}
            onChange={(e) => {
              setAccountId(e.target.value);
              setDone(null);
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} · {PLATFORM_META[a.platform].name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="import-file"
          label="CSV file"
          hint={`One row per day, up to ${IMPORT_MAX_ROWS.toLocaleString()} rows and 1 MB`}
          error={fileError ?? undefined}
        >
          <input
            ref={fileInput}
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby={describedBy("import-file", { hint: true, error: fileError })}
            onChange={(e) => void onFile(e.currentTarget)}
            className="block w-full text-[13px] text-fg-secondary file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-surface-raised file:px-3 file:text-[13px] file:text-fg hover:file:border-silver-400/50"
          />
        </Field>
      </div>

      {account ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
          <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
            <Download /> {PLATFORM_META[account.platform].name} template
          </Button>
          <span>
            Columns: <code className="text-fg-secondary">date</code> (YYYY-MM-DD) plus any metric {PLATFORM_META[account.platform].name} reports. Leave a cell empty when you don&apos;t have the number; it stays unavailable, never zero.
          </span>
        </div>
      ) : null}

      {preview ? (
        <section aria-live="polite" className="space-y-3 rounded-lg border border-line bg-surface-raised p-4">
          <h2 className="text-sm font-medium text-fg">Preview · {file?.name}</h2>
          <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
            <div>
              <dt className="text-xs text-fg-muted">Rows</dt>
              <dd className="text-fg">{preview.rows.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">From</dt>
              <dd className="text-fg">{range?.from ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">To</dt>
              <dd className="text-fg">{range?.to ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Metrics</dt>
              <dd className="text-fg">{preview.columns.length ? preview.columns.map((c) => METRIC_LABEL[c]).join(", ") : "—"}</dd>
            </div>
          </dl>
          {preview.errors.length ? (
            <Alert tone="danger" title={`Fix ${pluralize(preview.errors.length, "problem")} before importing`}>
              <ul className="list-disc space-y-0.5 pl-4">
                {preview.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {preview.warnings.length ? (
            <Alert tone="warning" title="Some columns will be skipped">
              {preview.warnings.join(" ")}
            </Alert>
          ) : null}
          <p className="text-xs text-fg-muted">
            Days already imported for this account are replaced. Data from platform syncs is kept separately and never overwritten.
          </p>
        </section>
      ) : null}

      {serverError ? <Alert tone="danger" title="Import failed">{serverError}</Alert> : null}
      {done ? (
        <Alert
          tone="success"
          title={`Imported ${pluralize(done.rows, "day")}`}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={`/w/${slug}/analytics`}>View analytics</Link>
            </Button>
          }
        >
          These numbers are labelled “Imported” wherever they appear.{done.warnings.length ? ` ${done.warnings.join(" ")}` : ""}
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={submit} disabled={!canSubmit} loading={pending}>
          <FileUp /> Import {preview?.rows.length ? pluralize(preview.rows.length, "day") : "metrics"}
        </Button>
      </div>
    </div>
  );
}
