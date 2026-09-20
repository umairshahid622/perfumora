import { useState, useEffect, type FormEvent } from "react";
import type { Fragrance, SizeKey, SizeMap, SizeVariant, FragranceConcentration } from "../lib/types";
import { SIZE_KEYS, offeredSizes, FRAGRANCE_CONCENTRATIONS } from "../lib/types";
import { useFragrances } from "../fragrances/context";
import { uploadFragranceImage } from "../lib/api";
import { errorMessage } from "../lib/errors";
import {
  removeImageBackground,
  trimImageBottom,
  autocropTransparentPadding,
  isImageAlreadyTransparent,
  blobToFile,
  type BgRemovalProgress,
} from "../lib/bgRemoval";
import {
  extractColorPresetsFromImage,
  getDefaultPresets,
  type ColorPreset,
} from "../lib/colorExtractor";
import { Button } from "../components/Button";
import { TextField, TextAreaField, SelectField } from "../components/Field";
import { NumericInput } from "../components/NumericInput";
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
  concentration: "Eau de Parfum",
  categoryId: undefined,
  categoryName: undefined,
  active: true,
  sizes: { "30ml": { ...NEW_VARIANT }, "50ml": { ...NEW_VARIANT } },
});

export function FragranceForm({ initial, onSubmit, onCancel }: Props) {
  const { categories } = useFragrances();
  const [draft, setDraft] = useState<Fragrance>(() => ({
    ...emptyDraft(),
    ...(initial ?? {}),
    concentration: initial?.concentration || "Eau de Parfum",
    categoryId: initial?.categoryId ?? (categories.length > 0 ? categories[0]!.id : undefined),
    categoryName: initial?.categoryName ?? (categories.length > 0 ? categories[0]!.name : undefined),
  }));

  // Dynamic AI color presets extracted from the perfume bottle image
  const [aiPresets, setAiPresets] = useState<ColorPreset[]>(getDefaultPresets());
  const [extractingPresets, setExtractingPresets] = useState(false);

  // Automatically extract 5 custom presets from the fragrance image
  useEffect(() => {
    let active = true;
    if (!draft.imageUrl) {
      setAiPresets(getDefaultPresets());
      return;
    }

    setExtractingPresets(true);
    extractColorPresetsFromImage(draft.imageUrl)
      .then((presets) => {
        if (!active || !presets || presets.length === 0) return;
        setAiPresets(presets);
        // If adding a new fragrance and color is default/unset, auto-select Signature Liquid
        if (!initial && draft.color === "#8c6a4a" && presets[0]) {
          setDraft((d) => ({ ...d, color: presets[0].hex }));
        }
      })
      .catch((err) => {
        console.warn("AI color extraction failed:", err);
      })
      .finally(() => {
        if (active) setExtractingPresets(false);
      });

    return () => {
      active = false;
    };
  }, [draft.imageUrl, initial]);

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

    // Ensure all numeric fields are cleanly cast numbers
    const sanitizedSizes: SizeMap = {};
    for (const size of SIZE_KEYS) {
      const v = draft.sizes[size];
      if (v) {
        sanitizedSizes[size] = {
          price: Number(v.price) || 0,
          stock: Math.max(0, Number(v.stock) || 0),
        };
      }
    }

    onSubmit({
      ...draft,
      sizes: sanitizedSizes,
      // New records need an id; existing ones keep theirs.
      id: draft.id || `frag_${Date.now().toString(36)}`,
      name: draft.name.trim(),
    });
  };

  return (
    <form id="fragrance-form" onSubmit={submit} className="flex flex-col min-h-full">
      {/* 2. Editor Grid */}
      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column (5 cols): Bottle Media, Swatch & Studio Controls */}
          <div className="space-y-5 lg:col-span-5">
            {/* Bottle Image Section */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-800">
                  Bottle Imagery
                </label>
                {draft.imageUrl && (
                  <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Uploaded
                  </span>
                )}
              </div>
              <ImagePicker
                value={draft.imageUrl}
                color={draft.color}
                fragranceName={draft.name}
                onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
              />
            </div>

            {/* Accent Color & AI Presets */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <label htmlFor="color" className="block text-sm font-semibold text-slate-800">
                Accent Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="color"
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                />
                <TextField
                  aria-label="Hex color"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="font-mono flex-1"
                />
                {typeof window !== "undefined" && "EyeDropper" in window && (
                  <button
                    type="button"
                    title="Sample color directly from screen or bottle image"
                    onClick={async () => {
                      try {
                        const eyeDropper = new (window as any).EyeDropper();
                        const res = await eyeDropper.open();
                        if (res?.sRGBHex) {
                          setDraft((d) => ({ ...d, color: res.sRGBHex }));
                        }
                      } catch {}
                    }}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 active:scale-95"
                  >
                    <Icon name="droplet" className="h-3.5 w-3.5 text-accent" />
                    Eyedropper
                  </button>
                )}
              </div>

              {/* AI Presets */}
              <div className="rounded-lg border border-slate-200/80 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                    <Icon name="sparkles" className="h-3.5 w-3.5 text-amber-500" />
                    AI Color Presets ({aiPresets.length})
                    {extractingPresets && (
                      <span className="text-[10px] font-normal text-slate-400 animate-pulse">
                        · Extracting...
                      </span>
                    )}
                  </span>
                  {draft.imageUrl && (
                    <button
                      type="button"
                      title="Rescan image to regenerate color presets"
                      onClick={() => {
                        setExtractingPresets(true);
                        extractColorPresetsFromImage(draft.imageUrl)
                          .then((presets) => setAiPresets(presets))
                          .finally(() => setExtractingPresets(false));
                      }}
                      className="flex items-center gap-1 text-[11px] text-slate-500 transition hover:text-slate-800"
                    >
                      <span>↻</span> Rescan
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {aiPresets.map((swatch, idx) => {
                    const isSelected = draft.color.toLowerCase() === swatch.hex.toLowerCase();
                    return (
                      <button
                        key={`${swatch.hex}-${idx}`}
                        type="button"
                        title={`${swatch.name} (${swatch.hex}) — ${swatch.description}`}
                        onClick={() => setDraft((d) => ({ ...d, color: swatch.hex }))}
                        className={`group relative flex items-center gap-1.5 rounded-md border px-2 py-1 transition-all ${
                          isSelected
                            ? "border-accent bg-amber-50/60 shadow-2xs ring-2 ring-accent/30 font-medium"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full border border-black/10 shrink-0 shadow-inner"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <span className="text-[11px] text-slate-700">
                          {swatch.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (7 cols): Information, Scent Notes, Sizes & Pricing, Storefront Visibility */}
          <div className="space-y-5 lg:col-span-7">
            {/* Fragrance Details */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-800">
                Fragrance Details
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField
                  id="name"
                  label="Name"
                  placeholder="e.g. Midnight Oud"
                  required
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
                <SelectField
                  id="category"
                  label="Category"
                  value={draft.categoryId ?? ""}
                  onChange={(e) => {
                    const catId = e.target.value;
                    const catObj = categories.find((c) => c.id === catId);
                    setDraft((d) => ({
                      ...d,
                      categoryId: catId || undefined,
                      categoryName: catObj?.name,
                    }));
                  }}
                >
                  {categories.length === 0 && (
                    <option value="">No categories loaded</option>
                  )}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="concentration"
                  label="Concentration"
                  value={draft.concentration || "Eau de Parfum"}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      concentration: e.target.value as FragranceConcentration,
                    }))
                  }
                >
                  {FRAGRANCE_CONCENTRATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectField>
              </div>

              <TextAreaField
                id="description"
                label="Description & Scent Notes"
                rows={3}
                placeholder="Deep, smoky, warm notes with amber and Madagascar vanilla."
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
              />
            </div>

            {/* Bottle Sizes & Pricing */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Bottle Sizes & Pricing
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Toggle sizes to offer. At least one size is required.
                  </p>
                </div>
                <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {offered.length} active
                </span>
              </div>

              <div className="space-y-2">
                {SIZE_KEYS.map((size) => {
                  const variant = draft.sizes[size];
                  const sold = Boolean(variant);
                  return (
                    <div
                      key={size}
                      className={`grid grid-cols-[2.75rem_3.5rem_1fr_1fr] items-center gap-3 rounded-lg border p-3 transition-colors ${
                        sold ? "border-slate-200 bg-white shadow-2xs" : "border-slate-200/60 bg-slate-100/60"
                      }`}
                    >
                      <Toggle
                        checked={sold}
                        onChange={(v) => toggleSize(size, v)}
                        aria-label={`Sell ${size}`}
                        small
                      />
                      <span
                        className={`text-sm font-bold ${
                          sold ? "text-slate-800" : "text-slate-400"
                        }`}
                      >
                        {size}
                      </span>
                      <label className="flex items-center gap-1.5 text-sm">
                        <span className={sold ? "text-slate-500 font-medium" : "text-slate-300"}>Rs</span>
                        <NumericInput
                          min={1}
                          required={sold}
                          disabled={!sold}
                          value={variant?.price}
                          allowZero={false}
                          onChange={(v) => setSize(size, "price", v)}
                          placeholder={sold ? "Price" : "—"}
                          className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          aria-label={`${size} price`}
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-sm">
                        <span className={sold ? "text-slate-500 font-medium" : "text-slate-300"}>Qty</span>
                        <NumericInput
                          min={0}
                          required={sold}
                          disabled={!sold}
                          value={variant?.stock}
                          allowZero={true}
                          onChange={(v) => setSize(size, "stock", v)}
                          placeholder={sold ? "Stock" : "—"}
                          className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          aria-label={`${size} quantity`}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
              {offered.length === 0 && (
                <p role="alert" className="text-xs font-medium text-rose-600">
                  Switch on at least one size — a fragrance with none cannot be saved.
                </p>
              )}
            </div>

            {/* Storefront Visibility Card */}
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition-colors hover:bg-slate-50">
              <div>
                <span className="block text-sm font-semibold text-slate-800">
                  Storefront Visibility
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  {draft.active ? "Visible to customers on the site" : "Hidden from catalog and search"}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`text-xs font-semibold uppercase tracking-wider ${draft.active ? "text-emerald-600" : "text-slate-400"}`}>
                  {draft.active ? "Active" : "Inactive"}
                </span>
                <Toggle
                  checked={draft.active}
                  onChange={(v) => setDraft((d) => ({ ...d, active: v }))}
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* 3. Footer */}
      <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50/90 backdrop-blur-md px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {offered.length === 0 ? (
            <span className="font-semibold text-rose-600">
              Configure at least one size before saving.
            </span>
          ) : (
            <span>
              Ready to save · {draft.name || "Untitled fragrance"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={offered.length === 0}>
            {initial ? "Save changes" : "Add fragrance"}
          </Button>
        </div>
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
  const [baseCutoutBlob, setBaseCutoutBlob] = useState<Blob | null>(null);
  const [activeMode, setActiveMode] = useState<"cutout" | "original">("cutout");
  const [trimPercent, setTrimPercent] = useState(0);
  const [showTrimSlider, setShowTrimSlider] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);

  const isPreviewable = value.startsWith("http");

  // Helper to lazily fetch base blob if user is editing an existing fragrance
  const getBaseBlob = async (): Promise<Blob | null> => {
    if (baseCutoutBlob) return baseCutoutBlob;
    if (!value || !value.startsWith("http")) return null;
    try {
      const res = await fetch(value);
      const b = await res.blob();
      setBaseCutoutBlob(b);
      return b;
    } catch (err) {
      console.warn("Could not fetch image blob:", err);
      return null;
    }
  };

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

    try {
      let processedBlob: Blob = file;
      const alreadyTransparent = await isImageAlreadyTransparent(file);

      if (!alreadyTransparent) {
        setProgress({ message: "Removing background...", percent: 20 });
        processedBlob = await removeImageBackground(file, (p) => {
          setProgress(p);
        });
      } else {
        setProgress({ message: "Transparent image detected, verifying framing...", percent: 60 });
      }

      // Automatically crop empty transparent space from all 4 sides (preserves already-cropped images untouched)
      setProgress({ message: "Auto-cropping empty padding...", percent: 90 });
      let finalBlob = processedBlob;
      try {
        finalBlob = await autocropTransparentPadding(processedBlob, 0.02);
      } catch (cropErr) {
        console.warn("Autocrop fallback to uncropped:", cropErr);
      }

      setBaseCutoutBlob(finalBlob);
      setActiveMode("cutout");
      setTrimPercent(0);

      // Upload the transparent cropped PNG
      setUploading(true);
      setProgress({ message: "Uploading transparent PNG...", percent: 95 });
      const pngFile = blobToFile(finalBlob, file.name, "cropped");
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

  const applyTrim = async (trim: number) => {
    setTrimPercent(trim);

    setUploading(true);
    setError(null);
    try {
      const base = await getBaseBlob();
      if (!base) {
        setError("Unable to load image for trimming.");
        return;
      }
      let result = base;
      if (trim > 0) {
        result = await trimImageBottom(result, trim);
      }
      const nameSlug = fragranceName
        ? fragranceName.toLowerCase().replace(/[^a-z0-9]/g, "-")
        : "fragrance";
      const filename = rawFile?.name || `${nameSlug}.png`;
      const pngFile = blobToFile(
        result,
        filename,
        `trimmed-${trim}`,
      );
      const publicUrl = await uploadFragranceImage(pngFile);
      onChange(publicUrl);
    } catch (err) {
      setError(errorMessage(err, "Failed to apply image trim."));
    } finally {
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
      } else {
        await applyTrim(trimPercent);
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to switch version."));
    } finally {
      setUploading(false);
    }
  };

  const handleAutoCrop = async () => {
    setUploading(true);
    setError(null);
    try {
      const base = await getBaseBlob();
      if (!base) {
        setError("Unable to load image for auto-crop.");
        return;
      }
      const croppedBlob = await autocropTransparentPadding(base, 0.02);
      setBaseCutoutBlob(croppedBlob);
      const nameSlug = fragranceName
        ? fragranceName.toLowerCase().replace(/[^a-z0-9]/g, "-")
        : "fragrance";
      const filename = rawFile?.name || `${nameSlug}-cropped.png`;
      const pngFile = blobToFile(croppedBlob, filename, "tight");
      const publicUrl = await uploadFragranceImage(pngFile);
      onChange(publicUrl);
    } catch (err) {
      setError(errorMessage(err, "Failed to auto-crop image padding."));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange("");
    setRawFile(null);
    setBaseCutoutBlob(null);
    setTrimPercent(0);
    setShowTrimSlider(false);
    setError(null);
  };

  return (
    <div className="space-y-2">
      {/* Upload Tile */}
      <div className="w-full">
        <label
          className="group relative flex h-48 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition-all hover:border-accent hover:shadow-sm"
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

      {/* Mode switch between Cutout and Original (when raw file is present) */}
      {rawFile && (
        <div className="w-full grid grid-cols-2 gap-1 rounded-lg bg-slate-200/70 p-0.5 text-xs">
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
      )}

      {/* Refinement controls once an image is available */}
      {isPreviewable && (
        <div className="w-full space-y-2 pt-0.5 text-xs">
          {/* Floor reflection trimmer toggle */}
          {activeMode === "cutout" && (
            <div>
              <button
                type="button"
                onClick={() => setShowTrimSlider(!showTrimSlider)}
                className="text-[11px] text-slate-500 hover:text-slate-800 transition-colors"
              >
                {showTrimSlider ? "Hide floor trim" : "Trim floor reflection"} {trimPercent > 0 ? `(-${trimPercent}%)` : ""}
              </button>

              {showTrimSlider && (
                <div className="mt-1 space-y-1 rounded-lg bg-slate-50 p-2 border border-slate-200">
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Bottom trim</span>
                    <span className="font-mono font-medium">{trimPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    step={2}
                    value={trimPercent}
                    onChange={(e) => void applyTrim(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-accent"
                  />
                </div>
              )}
            </div>
          )}

          {/* Auto-crop empty padding button */}
          {activeMode === "cutout" && (
            <button
              type="button"
              disabled={uploading || processing}
              onClick={() => void handleAutoCrop()}
              title="Remove surrounding transparent padding so the bottle fills the card frame"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
            >
              <Icon name="sparkles" className="h-3.5 w-3.5 text-amber-500" />
              Auto-crop empty space
            </button>
          )}

          {/* Storefront Card Preview Button */}
          <button
            type="button"
            onClick={() => setShowCardModal(true)}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 transition-colors"
          >
            <Icon name="eye" className="h-3.5 w-3.5 text-slate-500" />
            Preview on storefront card
          </button>
        </div>
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
          zIndex="z-[110]"
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
