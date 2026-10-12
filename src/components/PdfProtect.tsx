"use client";

import React, { useState } from "react";
import { Lock, LockOpen, FileText, Download, Info, AlertTriangle } from "lucide-react";
import {
  getPdfStatus,
  lockPdf,
  unlockPdf,
  AlreadyProtectedError,
  WrongPasswordError,
  type PdfStatus,
} from "@/lib/protect";
import { cn, downloadBlob, formatSize } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import PrivacyNote from "@/components/PrivacyNote";

type Tab = "lock" | "unlock";

const MIN_PASSWORD_LENGTH = 6;

export default function PdfProtect() {
  const [tab, setTab] = useState<Tab>("lock");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<PdfStatus | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [allowModifying, setAllowModifying] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; kind: Tab } | null>(null);

  const resetResult = () => {
    setResult(null);
    setError("");
  };

  const handleFile = async (selected: File | undefined) => {
    if (selected?.type !== "application/pdf") return;
    resetResult();
    setPassword("");
    setConfirm("");
    setFile(selected);
    setStatus(null);
    const detected = await getPdfStatus(await selected.arrayBuffer());
    setStatus(detected);
    if (detected === "password") setTab("unlock");
  };

  const { isDragging, dropProps } = useFileDrop((files) => handleFile(files[0]));

  const removeFile = () => {
    setFile(null);
    setStatus(null);
    setPassword("");
    setConfirm("");
    resetResult();
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setPassword("");
    setConfirm("");
    resetResult();
  };

  const passwordTooShort = tab === "lock" && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = tab === "lock" && confirm.length > 0 && confirm !== password;
  const blocked =
    status === null ||
    status === "invalid" ||
    (tab === "lock" && status === "password") ||
    (tab === "lock" && (password.length < MIN_PASSWORD_LENGTH || confirm !== password)) ||
    (tab === "unlock" && (status !== "password" || password.length === 0));

  const run = async () => {
    if (!file || blocked) return;
    setIsWorking(true);
    setError("");
    try {
      const buffer = await file.arrayBuffer();
      const bytes =
        tab === "lock"
          ? await lockPdf(buffer, password, { allowPrinting, allowCopying, allowModifying })
          : await unlockPdf(buffer, password);
      setResult({ blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), kind: tab });
      setPassword("");
      setConfirm("");
    } catch (err) {
      if (err instanceof WrongPasswordError) setError("Wrong password. Please try again.");
      else if (err instanceof AlreadyProtectedError) setError("This PDF already has a password. Use the Unlock tab first.");
      else {
        console.error("Protect error:", err);
        setError(tab === "lock" ? "Failed to lock the PDF." : "Failed to unlock the PDF.");
      }
    } finally {
      setIsWorking(false);
    }
  };

  const baseName = file?.name.replace(/\.[^/.]+$/, "") ?? "document";

  return (
    <div className="flex h-full flex-col bg-[#f0f4f8] dark:bg-slate-950 p-6 overflow-auto">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Protect PDF</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
            Lock a PDF with a password, or remove the password from one you own.
          </p>
          <PrivacyNote />
        </header>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-200/60 p-1 dark:bg-slate-900">
          {(["lock", "unlock"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => switchTab(value)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all ${
                tab === value
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              {value === "lock" ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              {value === "lock" ? "Lock" : "Unlock"}
            </button>
          ))}
        </div>

        {!file ? (
          <div
            {...dropProps}
            className={cn(
              "flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white p-16 shadow-sm dark:border-slate-800 dark:bg-slate-900",
              isDragging && "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
            )}
          >
            <label className="flex cursor-pointer flex-col items-center group">
              <div className="rounded-full bg-blue-50 p-8 shadow-inner dark:bg-blue-900/20 mb-6 transition-transform group-hover:scale-110">
                {tab === "lock" ? <Lock className="h-12 w-12 text-blue-600" /> : <LockOpen className="h-12 w-12 text-blue-600" />}
              </div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200">Drop PDF here</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2">or click to browse from your device</p>
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }} />
              <div className="mt-8 rounded-2xl bg-blue-600 px-10 py-3.5 text-lg font-bold text-white shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all">
                Select File
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-7 w-7 flex-shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-800 dark:text-slate-100" title={file.name}>{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatSize(file.size)}
                    {status === "password" && " · password-protected"}
                  </p>
                </div>
              </div>
              <button onClick={removeFile} className="text-sm font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl">
                Remove
              </button>
            </div>

            {status === "invalid" && <Notice tone="error">This file could not be read as a PDF.</Notice>}
            {status === "open" && tab === "unlock" && (
              <Notice tone="info">This PDF is not password-protected, so there is nothing to unlock.</Notice>
            )}
            {status === "password" && tab === "lock" && (
              <Notice tone="info">This PDF already has a password. Use the Unlock tab to remove it first.</Notice>
            )}

            {result ? (
              <div className="space-y-4 rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-900/20">
                <h3 className="text-xl font-bold text-emerald-600">
                  {result.kind === "lock" ? "PDF locked" : "PDF unlocked"}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {result.kind === "lock"
                    ? "Open it in your PDF viewer to confirm the password works before sharing. We cannot recover a lost password."
                    : "The password has been removed from this copy."}
                </p>
                <button
                  onClick={() =>
                    downloadBlob(result.blob, `${result.kind === "lock" ? "locked" : "unlocked"}_${baseName}.pdf`)
                  }
                  className="mx-auto flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 font-bold text-white hover:bg-blue-700"
                >
                  <Download className="h-5 w-5" />
                  Download
                </button>
              </div>
            ) : (
              <form
                className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                onSubmit={(e) => {
                  e.preventDefault();
                  run();
                }}
              >
                <div className="space-y-2">
                  <label htmlFor="pw" className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                    {tab === "lock" ? "New password" : "Password"}
                  </label>
                  <input
                    id="pw"
                    type={showPassword ? "text" : "password"}
                    autoComplete={tab === "lock" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  {passwordTooShort && (
                    <p className="text-xs text-red-500">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
                  )}
                </div>

                {tab === "lock" && (
                  <div className="space-y-2">
                    <label htmlFor="pw2" className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                      Confirm password
                    </label>
                    <input
                      id="pw2"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    {mismatch && <p className="text-xs text-red-500">Passwords do not match.</p>}
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
                  Show password
                </label>

                {tab === "lock" && (
                  <fieldset className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <legend className="text-sm font-bold text-slate-700 dark:text-slate-200">Allow people who open it to</legend>
                    {[
                      { label: "Print", checked: allowPrinting, set: setAllowPrinting },
                      { label: "Copy text and images", checked: allowCopying, set: setAllowCopying },
                      { label: "Edit and annotate", checked: allowModifying, set: setAllowModifying },
                    ].map(({ label, checked, set }) => (
                      <label key={label} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
                        {label}
                      </label>
                    ))}
                    <p className="text-xs text-slate-500">
                      Restrictions are honored by standard PDF viewers but are not a strong protection. The password is.
                    </p>
                  </fieldset>
                )}

                {tab === "lock" && (
                  <Notice tone="warn">
                    If you forget this password, the PDF cannot be recovered. Nothing is stored or sent anywhere.
                  </Notice>
                )}

                {error && <Notice tone="error">{error}</Notice>}

                <button
                  type="submit"
                  disabled={isWorking || blocked}
                  className="w-full rounded-2xl bg-blue-600 py-3.5 text-lg font-bold text-white shadow-xl shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:opacity-50"
                >
                  {isWorking ? "Working..." : tab === "lock" ? "Lock PDF" : "Unlock PDF"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Notice({
  tone,
  children,
}: Readonly<{ tone: "info" | "warn" | "error"; children: React.ReactNode }>) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-300",
    warn: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-400",
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400",
  }[tone];
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`flex gap-3 rounded-2xl border p-3 ${styles}`}>
      <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <p className="text-xs leading-relaxed">{children}</p>
    </div>
  );
}
