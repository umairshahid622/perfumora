import { useState, type FormEvent } from "react";
import type { Fragrance, SizeKey, SizeMap, SizeVariant } from "../lib/types";
import { SIZE_KEYS, offeredSizes } from "../lib/types";
import { uploadFragranceImage } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { Button } from "../components/Button";
import { TextField, TextAreaField } from "../components/Field";
import { Icon } from "../components/Icon";

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

/* Small square image dropzone. The file goes straight to the Supabase Storage
   bucket and what's kept on the draft is the returned public URL — an object
   URL would only survive until the next reload. */
function ImagePicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPreviewable = value.startsWith("http");

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadFragranceImage(file));
    } catch (err) {
      setError(errorMessage(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-28">
      <label
        className="relative flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 transition-colors hover:border-accent"
        style={!isPreviewable ? { backgroundColor: color } : undefined}
      >
        {isPreviewable ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-white/90">
            <Icon name="upload" className="h-5 w-5" />
            <span className="text-xs font-medium">Upload</span>
          </span>
        )}

        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          </span>
        )}

        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
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
