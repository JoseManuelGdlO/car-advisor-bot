import { Skeleton } from "@/components/ui/skeleton";

type ListRowSkeletonProps = {
  rows?: number;
  withBadge?: boolean;
};

export function ListRowSkeleton({ rows = 8, withBadge = false }: ListRowSkeletonProps) {
  return (
    <ul className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-2/3 max-w-48" />
              <Skeleton className="h-2.5 w-10 shrink-0" />
            </div>
            <Skeleton className="h-3 w-1/2 max-w-36" />
            {withBadge ? <Skeleton className="h-4 w-16 rounded-full" /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
