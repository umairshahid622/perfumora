import { useState, type FormEvent } from "react";
import type { Fragrance, SizeKey, SizeMap, SizeVariant } from "../lib/types";
import { SIZE_KEYS, offeredSizes } from "../lib/types";
import { uploadFragranceImage } from "../lib/api";
import { errorMessage } from "../lib/errors";
import {
  removeImageBackground,
  trimImageBottom,
  blobToFile,
  type BgRemovalProgress,
} from "../lib/bgRemoval";
import { Button } from "../components/Button";
import { TextField, TextAreaField } from "../components/Field";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";

/* Add/Edit fragrance form (rendered inside a Modal). Controlled local state;
   on submit it hands a fully-formed Fragrance back to the page, which saves it.
   `initial` undefined = "add" mode; otherwise "edit". */

interface Props {
  initial?: Fragrance;
  onSubmit: (frag: Fragrance) => void;
  onCancel: () => void;
}

const NEW_VARIANT: SizeVariant = { price: 0, stock: 0 };

// A blank draft for "add" mode. Both sizes start switched on because that's the
// common case; either can be switched off for a single-size fragrance.
const emptyDraft = (): Fragrance => ({
  id: "",
  name: "",
  imageUrl: "",
  color: "#8c6a4a",
  description: "",
  active: true,
  sizes: { "30ml": { ...NEW_VARIANT }, "50ml": { ...NEW_VARIANT } },
});

export function FragranceForm({ initial, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<Fragrance>(initial ?? emptyDraft());

  // Price/stock of sizes that have been switched off, so switching one back on
  // doesn't silently discard what was already typed into it.
  const [stashed, setStashed] = useState<SizeMap>({});

  const offered = offeredSizes(draft.sizes);

  const setSize = (size: SizeKey, key: "price" | "stock", value: number) =>
    setDraft((d) => {
      const variant = d.sizes[size];
      if (!variant) return d; // Switched off — its inputs are disabled.
      return { ...d, sizes: { ...d.sizes, [size]: { ...variant, [key]: value } } };
    });

  const toggleSize = (size: SizeKey, sell: boolean) => {
    if (sell) {
      const restored = stashed[size] ?? { ...NEW_VARIANT };
      setDraft((d) => ({ ...d, sizes: { ...d.sizes, [size]: restored } }));
      return;
    }

    const current = draft.sizes[size];
    if (current) setStashed((s) => ({ ...s, [size]: current }));
    setDraft((d) => {
      const sizes = { ...d.sizes };
      delete sizes[size];
      return { ...d, sizes };
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (offered.length === 0) return; // Submit is disabled, but belt and braces.
    onSubmit({
      ...draft,
      // New records need an id; existing ones keep theirs.
      id: draft.id || `frag_${Date.now().toString(36)}`,
      name: draft.name.trim(),
    });
  };

  return (
    <form id="fragrance-form" onSubmit={submit} className="space-y-5">
      {/* Image + color */}
      <div className="flex gap-4">
        <div className="shrink-0">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Image
          </label>
          <ImagePicker
            value={draft.imageUrl}
            color={draft.color}
            fragranceName={draft.name}
            onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
          />
        </div>
        <div className="flex-1 space-y-4">
          <TextField
            id="name"
            label="Name"
            placeholder="e.g. Midnight Oud"
            required
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <div>
            <label
              htmlFor="color"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Accent color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="color"
                type="color"
                value={draft.color}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, color: e.target.value }))
                }
                className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
              />
              <TextField
                aria-label="Hex color"
                value={draft.color}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, color: e.target.value }))
                }
                className="font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      <TextAreaField
        id="description"
        label="Description"
        rows={2}
        placeholder="Deep, smoky, warm."
        value={draft.description}
        onChange={(e) =>
          setDraft((d) => ({ ...d, description: e.target.value }))
        }
      />

      {/* Per-size price + stock. A size that isn't sold is switched off here
          rather than left at zero, so the storefront can hide it entirely. */}
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Sizes sold</p>
        <p className="mb-2 text-xs text-slate-500">
          Switch off a size you don&apos;t sell. At least one is required.
        </p>
        <div className="space-y-2">
          {SIZE_KEYS.map((size) => {
            const variant = draft.sizes[size];
            const sold = Boolean(variant);
            return (
              <div
                key={size}
                className={`grid grid-cols-[2.75rem_3rem_1fr_1fr] items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                  sold ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-slate-100/60"
                }`}
              >
                <Toggle
                  checked={sold}
                  onChange={(v) => toggleSize(size, v)}
                  aria-label={`Sell ${size}`}
                  small
                />
                <span
                  className={`text-sm font-semibold ${
                    sold ? "text-slate-700" : "text-slate-400"
                  }`}
                >
                  {size}
                </span>
                <label className="flex items-center gap-1.5 text-sm">
                  <span className={sold ? "text-slate-400" : "text-slate-300"}>Rs</span>
                  <input
                    type="number"
                    min={1}
                    required={sold}
                    disabled={!sold}
                    value={variant?.price || ""}
                    onChange={(e) => setSize(size, "price", Number(e.target.value))}
                    placeholder={sold ? "Price" : "—"}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <span className={sold ? "text-slate-400" : "text-slate-300"}>Qty</span>
                  <input
                    type="number"
                    min={0}
                    required={sold}
                    disabled={!sold}
                    value={variant?.stock ?? ""}
                    onChange={(e) => setSize(size, "stock", Number(e.target.value))}
                    placeholder={sold ? "Stock" : "—"}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
              </div>
            );
          })}
        </div>
        {offered.length === 0 && (
          <p role="alert" className="mt-2 text-xs text-rose-600">
            Switch on at least one size — a fragrance with none can&apos;t be sold.
          </p>
        )}
      </div>

      {/* Active toggle */}
      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3">
        <span>
          <span className="block text-sm font-medium text-slate-700">
            Active
          </span>
          <span className="block text-xs text-slate-500">
            Visible on the storefront
          </span>
        </span>
        <Toggle
          checked={draft.active}
          onChange={(v) => setDraft((d) => ({ ...d, active: v }))}
        />
      </label>

      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={offered.length === 0}>
          {initial ? "Save changes" : "Add fragrance"}
        </Button>
      </div>
    </form>
  );
}

/* Image picker with in-browser AI background removal, reflection trimmer, and
   storefront card preview. Transparent PNGs are uploaded directly to Supabase Storage. */
function ImagePicker({
  value,
  color,
  fragranceName,
  onChange,
}: {
  value: string;
  color: string;
  fragranceName?: string;
  onChange: (url: string) => void;
}) {
  const [autoRemoveBg, setAutoRemoveBg] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<BgRemovalProgress>({
    message: "",
    percent: 0,
  });
  const [error, setError] = useState<string | null>(null);

  // In-memory references to enable toggling between Cutout and Original
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  const [activeMode, setActiveMode] = useState<"cutout" | "original">("cutout");
  const [trimPercent, setTrimPercent] = useState(0);
  const [showTrimSlider, setShowTrimSlider] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);

  const isPreviewable = value.startsWith("http");

  const processAndUpload = async (file: File) => {
    setError(null);
    setRawFile(file);

    if (!autoRemoveBg) {
      setUploading(true);
      try {
        const publicUrl = await uploadFragranceImage(file);
        onChange(publicUrl);
      } catch (err) {
        setError(errorMessage(err, "Upload failed."));
      } finally {
        setUploading(false);
      }
      return;
    }

    setProcessing(true);
    setProgress({ message: "Starting AI cutout...", percent: 10 });

    try {
      // 1. Run client-side AI background removal
      const processedBlob = await removeImageBackground(file, (p) => {
        setProgress(p);
      });

      setCutoutBlob(processedBlob);
      setActiveMode("cutout");
      setTrimPercent(0);

      // 2. Upload the transparent PNG
      setUploading(true);
      setProgress({ message: "Uploading transparent PNG...", percent: 95 });
      const pngFile = blobToFile(processedBlob, file.name);
      const publicUrl = await uploadFragranceImage(pngFile);
      onChange(publicUrl);
    } catch (err) {
      console.warn("AI background removal error:", err);
      setError("AI cutout encountered an issue. Uploading original image instead.");
      try {
        setUploading(true);
        const publicUrl = await uploadFragranceImage(file);
        onChange(publicUrl);
      } catch (uploadErr) {
        setError(errorMessage(uploadErr, "Upload failed."));
      }
    } finally {
      setProcessing(false);
      setUploading(false);
    }
  };

  const switchMode = async (mode: "cutout" | "original") => {
    if (mode === activeMode || !rawFile) return;
    setActiveMode(mode);
    setUploading(true);
    setError(null);
    try {
      if (mode === "original") {
        const publicUrl = await uploadFragranceImage(rawFile);
        onChange(publicUrl);
      } else if (cutoutBlob) {
        const toUpload =
          trimPercent > 0
            ? await trimImageBottom(cutoutBlob, trimPercent)
            : cutoutBlob;
        const pngFile = blobToFile(toUpload, rawFile.name);
        const publicUrl = await uploadFragranceImage(pngFile);
        onChange(publicUrl);
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to switch version."));
    } finally {
      setUploading(false);
    }
  };

  const applyTrim = async (percent: number) => {
    setTrimPercent(percent);
    if (!cutoutBlob || !rawFile) return;
    setUploading(true);
    setError(null);
    try {
      const trimmed = await trimImageBottom(cutoutBlob, percent);
      const pngFile = blobToFile(trimmed, rawFile.name, `trimmed-${percent}`);
      const publicUrl = await uploadFragranceImage(pngFile);
      onChange(publicUrl);
    } catch (err) {
      setError(errorMessage(err, "Failed to trim reflection."));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange("");
    setRawFile(null);
    setCutoutBlob(null);
    setTrimPercent(0);
    setShowTrimSlider(false);
    setError(null);
  };

  return (
    <div className="space-y-2">
      {/* Upload Tile */}
      <div className="w-36">
        <label
          className="group relative flex h-36 w-36 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition-all hover:border-accent hover:shadow-sm"
          style={
            isPreviewable
              ? { backgroundColor: color }
              : undefined
          }
        >
          {isPreviewable ? (
            <>
              {/* Studio wash highlight */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 78% at 50% 14%, rgba(255,255,255,0.22), transparent 60%)",
                }}
              />
              <img
                src={value}
                alt=""
                className="relative z-10 h-full w-full object-contain p-2 filter drop-shadow-[0_12px_20px_rgba(0,0,0,0.35)] transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 z-20 flex items-center justify-center gap-1.5 bg-slate-900/60 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="flex items-center gap-1 rounded-md bg-white/20 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                  <Icon name="upload" className="h-3.5 w-3.5" />
                  Replace
                </span>
                <button
                  type="button"
                  onClick={removeImage}
                  className="rounded-md bg-rose-500/80 p-1 text-white hover:bg-rose-600"
                  title="Remove image"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : (
            <span className="flex flex-col items-center gap-1.5 text-slate-400 group-hover:text-accent">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 group-hover:bg-accent/10">
                <Icon name="upload" className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">Upload photo</span>
            </span>
          )}

          {/* Uploading or AI processing overlay */}
          {(uploading || processing) && (
            <span className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/80 p-2 text-center text-white">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              <span className="mt-2 text-[11px] font-medium leading-tight">
                {processing ? progress.message : "Saving image…"}
              </span>
              {processing && progress.percent !== undefined && (
                <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              )}
            </span>
          )}

          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={uploading || processing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void processAndUpload(file);
            }}
          />
        </label>
      </div>

      {/* Auto-remove BG Toggle */}
      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 hover:text-slate-900 select-none">
        <input
          type="checkbox"
          checked={autoRemoveBg}
          onChange={(e) => setAutoRemoveBg(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
        />
        <span className="flex items-center gap-1 font-medium">
          <Icon name="sparkles" className="h-3.5 w-3.5 text-amber-500" />
          Auto-remove background
        </span>
      </label>

      {/* Refinement controls once an image is uploaded and cutout is available */}
      {isPreviewable && cutoutBlob && rawFile && (
        <div className="w-56 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">Image Version</span>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              <Icon name="sparkles" className="h-2.5 w-2.5" />
              Cutout
            </span>
          </div>

          {/* Mode switch */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/70 p-0.5">
            <button
              type="button"
              onClick={() => void switchMode("cutout")}
              className={`rounded-md py-1 text-center font-medium transition-all ${
                activeMode === "cutout"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Cutout
            </button>
            <button
              type="button"
              onClick={() => void switchMode("original")}
              className={`rounded-md py-1 text-center font-medium transition-all ${
                activeMode === "original"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Original
            </button>
          </div>

          {/* Reflection trimmer (useful when studio bottle shots have a tabletop reflection) */}
          {activeMode === "cutout" && (
            <div className="border-t border-slate-200/80 pt-1.5">
              <button
                type="button"
                onClick={() => setShowTrimSlider(!showTrimSlider)}
                className="flex w-full items-center justify-between text-slate-600 hover:text-slate-900"
              >
                <span>Trim floor reflection</span>
                <span className="text-slate-400 font-mono text-[10px]">
                  {trimPercent > 0 ? `-${trimPercent}%` : "0%"}
                </span>
              </button>

              {showTrimSlider && (
                <div className="mt-1.5 space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={35}
                    step={2}
                    value={trimPercent}
                    onChange={(e) => void applyTrim(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-300 accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Keep all</span>
                    <span>Trim 35%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Storefront Card Preview Button */}
          <button
            type="button"
            onClick={() => setShowCardModal(true)}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1 font-medium text-slate-700 shadow-xs hover:bg-slate-100"
          >
            <Icon name="eye" className="h-3 w-3" />
            Preview on storefront card
          </button>
        </div>
      )}

      {/* When image exists but not from local session, still allow Card Preview */}
      {isPreviewable && !cutoutBlob && (
        <button
          type="button"
          onClick={() => setShowCardModal(true)}
          className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-accent"
        >
          <Icon name="eye" className="h-3.5 w-3.5" />
          Preview on storefront card
        </button>
      )}

      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}

      {/* Storefront Card Preview Modal */}
      {showCardModal && (
        <Modal
          open={showCardModal}
          onClose={() => setShowCardModal(false)}
          title="Storefront Card Preview"
          maxWidth="max-w-xs"
        >
          <div className="p-4">
            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#faf6ee] shadow-xl">
              {/* Colored top panel with bottle */}
              <div
                className="relative flex items-center justify-center"
                style={{ backgroundColor: color }}
              >
                {/* Studio wash */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(120% 78% at 50% 14%, rgba(255,255,255,0.22), transparent 62%)",
                  }}
                />
                <span className="absolute top-3 left-3 z-20 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur-sm">
                  01
                </span>
                <div className="relative z-10 px-6 pt-8 pb-10">
                  <div className="mx-auto aspect-[3/4] w-36 drop-shadow-[0_24px_30px_rgba(11,11,12,0.55)]">
                    <img
                      src={value}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Card content */}
              <div className="px-5 pb-5">
                <div className="mt-2.5 mb-3 flex">
                  <span
                    className="inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold text-white shadow-sm"
                    style={{ backgroundColor: color }}
                  >
                    Rs. 3,600
                  </span>
                </div>
                <h4 className="text-base font-semibold text-slate-900">
                  {fragranceName || "Perfume Name"}
                </h4>
                <p className="text-[10px] font-medium uppercase text-slate-400">
                  Parfum
                </p>
                <div className="mt-4 flex gap-2">
                  <span className="flex-1 rounded-full border border-slate-300 py-1 text-center text-xs font-medium text-slate-700">
                    30ML
                  </span>
                  <span
                    className="flex-1 rounded-full border py-1 text-center text-xs font-semibold"
                    style={{ borderColor: color, color }}
                  >
                    50ML
                  </span>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-full py-2 text-xs font-semibold text-white shadow-sm"
                  style={{ backgroundColor: color }}
                >
                  ADD TO BAG
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCardModal(false)}
              >
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Native-styled switch (checkbox under the hood). `small` is the inline size
   used in the per-size rows; the default is the standalone one. */
function Toggle({
  checked,
  onChange,
  small = false,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  small?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors ${
        small ? "h-5 w-9" : "h-6 w-11"
      } ${checked ? "bg-accent" : "bg-slate-300"}`}
    >
      <span
        className={`inline-block transform rounded-full bg-white shadow transition-transform ${
          small ? "h-4 w-4" : "h-5 w-5"
        } ${
          checked
            ? small
              ? "translate-x-4"
              : "translate-x-5"
            : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
