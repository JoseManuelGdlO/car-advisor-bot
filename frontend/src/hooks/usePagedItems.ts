import { useMemo, useState } from "react";

export const LIST_PAGE_SIZE = 30;

export function usePagedItems<T>(items: T[], resetKey: string, pageSize = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [appliedResetKey, setAppliedResetKey] = useState(resetKey);
  const pendingReset = appliedResetKey !== resetKey;

  if (pendingReset) {
    setAppliedResetKey(resetKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const requestedPage = pendingReset ? 1 : page;

  if (!pendingReset && page > pageCount) {
    setPage(pageCount);
  }

  const currentPage = Math.min(requestedPage, pageCount);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const rangeStart = items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, items.length);

  return {
    page: currentPage,
    setPage,
    pageCount,
    pageItems,
    total: items.length,
    rangeStart,
    rangeEnd,
  };
}
