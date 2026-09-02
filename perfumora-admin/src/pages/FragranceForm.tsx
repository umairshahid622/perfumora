import { useState, type FormEvent } from "react";
import type { Fragrance, SizeKey } from "../lib/types";
import { SIZE_KEYS } from "../lib/types";
import { Button } from "../components/Button";
import { TextField, TextAreaField } from "../components/Field";
import { Icon } from "../components/Icon";

/* Add/Edit fragrance form (rendered inside a Modal). Controlled local state;
   on submit it hands a fully-formed Fragrance back to the page, which owns the
   list. `initial` undefined = "add" mode; otherwise "edit". */

interface Props {
  initial?: Fragrance;
  onSubmit: (frag: Fragrance) => void;
  onCancel: () => void;
}

// A blank draft for "add" mode.
const emptyDraft = (): Fragrance => ({
  id: "",
  name: "",
  imageUrl: "",
  color: "#8c6a4a",
  description: "",
  active: true,
  sizes: {
    "30ml": { price: 0, stock: 0 },
    "50ml": { price: 0, stock: 0 },
  },
});

export function FragranceForm({ initial, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<Fragrance>(initial ?? emptyDraft());

  const setSize = (size: SizeKey, key: "price" | "stock", value: number) =>
    setDraft((d) => ({
      ...d,
      sizes: { ...d.sizes, [size]: { ...d.sizes[size], [key]: value } },
    }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...draft,
      // Generate a Firestore-ish id for new records.
      id: draft.id || `frag_${Date.now().toString(36)}`,
      name: draft.name.trim(),
      imageUrl:
        draft.imageUrl ||
        `/images/${draft.name.trim().toLowerCase().replace(/\s+/g, "-")}.jpg`,
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

      {/* Per-size price + stock */}
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Pricing &amp; stock
        </p>
        <div className="space-y-2">
          {SIZE_KEYS.map((size) => (
            <div
              key={size}
              className="grid grid-cols-[3rem_1fr_1fr] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
            >
              <span className="text-sm font-semibold text-slate-700">
                {size}
              </span>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-slate-400">Rs</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={draft.sizes[size].price || ""}
                  onChange={(e) =>
                    setSize(size, "price", Number(e.target.value))
                  }
                  placeholder="Price"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-slate-400">Qty</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={draft.sizes[size].stock}
                  onChange={(e) =>
                    setSize(size, "stock", Number(e.target.value))
                  }
                  placeholder="Stock"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
                />
              </label>
            </div>
          ))}
        </div>
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
        <Button type="submit">
          {initial ? "Save changes" : "Add fragrance"}
        </Button>
      </div>
    </form>
  );
}

/* Small square image dropzone. In the design phase it accepts a local file and
   previews it via an object URL — no upload happens. A real build swaps the
   onChange body for a Firebase Storage upload that returns a download URL. */
function ImagePicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (url: string) => void;
}) {
  const isPreviewable = value.startsWith("blob:") || value.startsWith("http");
  return (
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
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(URL.createObjectURL(file));
        }}
      />
    </label>
  );
}

/* Native-styled switch (checkbox under the hood). */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
