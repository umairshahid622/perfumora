import type { OrderStatus } from "../lib/types";
import { Icon, type IconName } from "./Icon";
import { cn } from "../lib/cn";

/* Colored pill for an order's status. Colors are semantic and reused by the
   dashboard, order list, and order detail so a status always reads the same. */

const STATUS_STYLES: Record<
  OrderStatus,
  { label: string; className: string; icon: IconName }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 ring-amber-600/20",
    icon: "clock",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-800 ring-blue-600/20",
    icon: "package",
  },
  delivered: {
    label: "Delivered",
    className: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
    icon: "check-circle",
  },
  canceled: {
    label: "Canceled",
    className: "bg-rose-100 text-rose-700 ring-rose-600/20",
    icon: "x-circle",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        s.className,
        className,
      )}
    >
      <Icon name={s.icon} className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}
