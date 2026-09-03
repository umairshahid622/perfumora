import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { TextField } from "../components/Field";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { FragranceForm } from "./FragranceForm";
import { formatPrice } from "../lib/format";
import type { Fragrance } from "../lib/types";
import { LOW_STOCK_THRESHOLD, SIZE_KEYS } from "../lib/types";
import { cn } from "../lib/cn";

/* ---------------------------------------------------------------------------
   Fragrance inventory.

   Seed data is hardcoded inline and shaped exactly like Firestore docs
   (see lib/types → Fragrance). A dozen here stand in for the ~25 real SKUs.
   `useState` makes add / edit / delete / toggle work for the session (resets
   on reload) — the same handlers will later call Firestore mutations.
--------------------------------------------------------------------------- */

const SEED: Fragrance[] = [
  {
    id: "frag_001", name: "Midnight Oud", imageUrl: "/images/midnight-oud.jpg",
    color: "#2E2A24", description: "Deep, smoky, warm.", active: true,
    sizes: { "30ml": { price: 2500, stock: 4 }, "50ml": { price: 3800, stock: 2 } },
  },
  {
    id: "frag_002", name: "White Musk", imageUrl: "/images/white-musk.jpg",
    color: "#e7e0d5", description: "Clean, soft, powdery.", active: true,
    sizes: { "30ml": { price: 2200, stock: 9 }, "50ml": { price: 3500, stock: 6 } },
  },
  {
    id: "frag_004", name: "Rose Taif", imageUrl: "/images/rose-taif.jpg",
    color: "#8c3b4a", description: "Bright rose, dewy petals.", active: true,
    sizes: { "30ml": { price: 2900, stock: 3 }, "50ml": { price: 4100, stock: 5 } },
  },
  {
    id: "frag_005", name: "Citrus Bloom", imageUrl: "/images/citrus-bloom.jpg",
    color: "#d8a13a", description: "Zesty bergamot and neroli.", active: true,
    sizes: { "30ml": { price: 2300, stock: 12 }, "50ml": { price: 3400, stock: 8 } },
  },
  {
    id: "frag_007", name: "Sandalwood Dusk", imageUrl: "/images/sandalwood-dusk.jpg",
    color: "#a56a3f", description: "Creamy sandalwood, dry cedar.", active: true,
    sizes: { "30ml": { price: 2600, stock: 7 }, "50ml": { price: 3900, stock: 4 } },
  },
  {
    id: "frag_009", name: "Amber Noir", imageUrl: "/images/amber-noir.jpg",
    color: "#3b2f2f", description: "Resinous amber, dark vanilla.", active: true,
    sizes: { "30ml": { price: 3000, stock: 5 }, "50ml": { price: 4200, stock: 1 } },
  },
  {
    id: "frag_012", name: "Vetiver Green", imageUrl: "/images/vetiver-green.jpg",
    color: "#3f5e3a", description: "Earthy vetiver, crushed leaves.", active: true,
    sizes: { "30ml": { price: 2400, stock: 2 }, "50ml": { price: 3600, stock: 6 } },
  },
  {
    id: "frag_014", name: "Jasmine Veil", imageUrl: "/images/jasmine-veil.jpg",
    color: "#eae3c9", description: "Heady jasmine, white florals.", active: true,
    sizes: { "30ml": { price: 2700, stock: 10 }, "50ml": { price: 3800, stock: 7 } },
  },
  {
    id: "frag_016", name: "Leather Bound", imageUrl: "/images/leather-bound.jpg",
    color: "#5a3d2b", description: "Supple leather, smoked tea.", active: false,
    sizes: { "30ml": { price: 3100, stock: 0 }, "50ml": { price: 4400, stock: 0 } },
  },
  {
    id: "frag_018", name: "Sea Salt & Sage", imageUrl: "/images/sea-salt-sage.jpg",
    color: "#7f9aa6", description: "Cool salt air, green sage.", active: true,
    sizes: { "30ml": { price: 2500, stock: 14 }, "50ml": { price: 3700, stock: 9 } },
  },
  {
    id: "frag_021", name: "Fig & Cedar", imageUrl: "/images/fig-cedar.jpg",
    color: "#6b6244", description: "Milky fig, warm cedarwood.", active: true,
    sizes: { "30ml": { price: 2600, stock: 3 }, "50ml": { price: 3900, stock: 11 } },
  },
  {
    id: "frag_023", name: "Saffron Ember", imageUrl: "/images/saffron-ember.jpg",
    color: "#a8452a", description: "Spiced saffron, glowing amber.", active: false,
    sizes: { "30ml": { price: 3200, stock: 6 }, "50ml": { price: 4600, stock: 2 } },
  },
];

type Filter = "all" | "low-stock" | "inactive";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "low-stock", label: "Low stock" },
  { key: "inactive", label: "Inactive" },
];

/** Lowest stock across a fragrance's sizes (drives the low-stock chip/filter). */
const minStock = (f: Fragrance) =>
  Math.min(...SIZE_KEYS.map((s) => f.sizes[s].stock));

export function Fragrances() {
  const [items, setItems] = useState<Fragrance[]>(SEED);
  const [query, setQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter is URL-driven so the dashboard's "low stock" links land here scoped.
  const filter = (searchParams.get("filter") as Filter) || "all";
  const setFilter = (f: Filter) =>
    setSearchParams(f === "all" ? {} : { filter: f }, { replace: true });

  // Modal + delete-confirm state.
  const [editing, setEditing] = useState<Fragrance | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [toDelete, setToDelete] = useState<Fragrance | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((f) => {
      if (filter === "low-stock" && minStock(f) > LOW_STOCK_THRESHOLD) return false;
      if (filter === "inactive" && f.active) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, filter]);

  // ---- Mutations (session-only; swap bodies for Firestore writes later) ----
  const upsert = (frag: Fragrance) => {
    setItems((prev) => {
      const exists = prev.some((f) => f.id === frag.id);
      return exists
        ? prev.map((f) => (f.id === frag.id ? frag : f))
        : [frag, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  };

  const toggleActive = (id: string) =>
    setItems((prev) =>
      prev.map((f) => (f.id === id ? { ...f, active: !f.active } : f)),
    );

  const remove = (id: string) => {
    setItems((prev) => prev.filter((f) => f.id !== id));
    setToDelete(null);
  };

  const openAdd = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (f: Fragrance) => {
    setEditing(f);
    setShowForm(true);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Fragrances"
        description={`${items.length} in catalog`}
        actions={
          <Button onClick={openAdd}>
            <Icon name="plus" className="h-4 w-4" />
            Add fragrance
          </Button>
        }
      />

      {/* Search + filters toolbar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:max-w-xs sm:flex-1">
          <TextField
            aria-label="Search fragrances"
            placeholder="Search by name…"
            leading={<Icon name="search" className="h-4 w-4" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.key
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <EmptyState
            icon="droplet"
            title="No fragrances found"
            message="Try a different search or filter."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f) => (
            <FragranceCard
              key={f.id}
              frag={f}
              onEdit={() => openEdit(f)}
              onToggle={() => toggleActive(f.id)}
              onDelete={() => setToDelete(f)}
            />
          ))}
        </div>
      )}

      {/* Add / edit modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit fragrance" : "Add fragrance"}
        maxWidth="max-w-xl"
      >
        <FragranceForm
          initial={editing ?? undefined}
          onSubmit={upsert}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete fragrance"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => toDelete && remove(toDelete.id)}>
              <Icon name="trash" className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete{" "}
          <span className="font-semibold text-slate-900">{toDelete?.name}</span>{" "}
          permanently? This can't be undone. To hide it from the storefront
          instead, use the active toggle.
        </p>
      </Modal>
    </div>
  );
}

/* ---- Single fragrance card ---- */
function FragranceCard({
  frag,
  onEdit,
  onToggle,
  onDelete,
}: {
  frag: Fragrance;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const low = minStock(frag) <= LOW_STOCK_THRESHOLD;
  const isPreviewable =
    frag.imageUrl.startsWith("blob:") || frag.imageUrl.startsWith("http");

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md",
        frag.active ? "border-slate-200" : "border-slate-200 opacity-75",
      )}
      style={{ borderTopWidth: 3, borderTopColor: frag.color }}
    >
      {/* Image / color swatch */}
      <div
        className="relative flex h-32 items-center justify-center"
        style={{ backgroundColor: frag.color }}
      >
        {isPreviewable && (
          <img
            src={frag.imageUrl}
            alt={frag.name}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          {!frag.active && (
            <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
              Inactive
            </span>
          )}
          {low && (
            <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
              Low stock
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold text-slate-900">{frag.name}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
          {frag.description}
        </p>

        {/* Size rows */}
        <div className="mt-3 space-y-1.5">
          {SIZE_KEYS.map((size) => {
            const v = frag.sizes[size];
            const sizeLow = v.stock <= LOW_STOCK_THRESHOLD;
            return (
              <div
                key={size}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-slate-500">{size}</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {formatPrice(v.price)}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      v.stock === 0
                        ? "bg-rose-50 text-rose-600"
                        : sizeLow
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {v.stock === 0 ? "Out" : `${v.stock} left`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-1 border-t border-slate-100 pt-3">
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            title={frag.active ? "Set inactive" : "Set active"}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                frag.active ? "bg-emerald-500" : "bg-slate-300",
              )}
            />
            {frag.active ? "Active" : "Inactive"}
          </button>
          <div className="flex-1" />
          <button
            onClick={onEdit}
            aria-label={`Edit ${frag.name}`}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <Icon name="edit" className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete ${frag.name}`}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
