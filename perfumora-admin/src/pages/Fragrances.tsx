import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { TextField } from "../components/Field";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { FragranceForm } from "./FragranceForm";
import { useFragrances } from "../fragrances/context";
import { formatPrice } from "../lib/format";
import type { Fragrance } from "../lib/types";
import { LOW_STOCK_THRESHOLD, offeredSizes } from "../lib/types";
import { cn } from "../lib/cn";

/* ---------------------------------------------------------------------------
   Fragrance inventory.

   Reads and writes the catalog through FragrancesProvider, which is backed by
   the `fragrances` + `fragrance_sizes` tables. Add / edit / delete / toggle all
   hit Postgres; the grid updates immediately and rolls back to the server's
   version if a write is refused.
--------------------------------------------------------------------------- */

type Filter = "all" | "low-stock" | "inactive";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "low-stock", label: "Low stock" },
  { key: "inactive", label: "Inactive" },
];

/**
 * Lowest stock across the sizes a fragrance actually sells (drives the
 * low-stock chip/filter). Sizes it doesn't sell are skipped, so a 30ml-only
 * fragrance isn't permanently "low" on a 50ml it never had. A fragrance with
 * no sizes at all gives Infinity — not low stock, just misconfigured, which
 * the card surfaces on its own.
 */
const minStock = (f: Fragrance) =>
  Math.min(...offeredSizes(f.sizes).map(({ variant }) => variant.stock));

export function Fragrances() {
  const { fragrances, loading, error, refresh, save, remove, setActive } =
    useFragrances();
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
    return fragrances.filter((f) => {
      if (filter === "low-stock" && minStock(f) > LOW_STOCK_THRESHOLD) return false;
      if (filter === "inactive" && f.active) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fragrances, query, filter]);

  // ---- Mutations. Each resolves false on failure, with `error` explaining. ----
  const upsert = async (frag: Fragrance) => {
    if (!(await save(frag))) return; // Keep the form open so nothing is lost.
    setShowForm(false);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(null);
    await remove(id);
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
        description={loading ? "Loading…" : `${fragrances.length} in catalog`}
        actions={
          <Button onClick={openAdd}>
            <Icon name="plus" className="h-4 w-4" />
            Add fragrance
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => void refresh()}
            className="font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

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
      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <EmptyState
            icon="droplet"
            title="No fragrances found"
            message={
              fragrances.length === 0
                ? "Add your first fragrance to get started."
                : "Try a different search or filter."
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f) => (
            <FragranceCard
              key={f.id}
              frag={f}
              onEdit={() => openEdit(f)}
              onToggle={() => void setActive(f.id, !f.active)}
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
          onSubmit={(frag) => void upsert(frag)}
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
            <Button variant="danger" onClick={() => void confirmDelete()}>
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
  const sizes = offeredSizes(frag.sizes);
  // Uploaded images are absolute Storage URLs; anything else falls back to the
  // accent colour as the tile.
  const isPreviewable = frag.imageUrl.startsWith("http");

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

        {/* Size rows — only the sizes this fragrance actually sells. */}
        <div className="mt-3 space-y-1.5">
          {sizes.map(({ size, variant: v }) => {
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
          {sizes.length === 0 && (
            <p className="text-sm text-rose-600">No sizes set — edit to add one.</p>
          )}
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
