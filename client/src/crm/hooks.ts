import { useId } from "react";
import { useQuery } from "@tanstack/react-query";

/** A scoped query prevents unrelated panels from sharing a cache key. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const id = useId();
  const query = useQuery({
    queryKey: ["panel", id, ...deps],
    queryFn: loader,
    retry: false,
  });
  return {
    data: query.data ?? null,
    error: query.error instanceof Error ? query.error.message : "",
    loading: query.isFetching,
    reload: () => {
      void query.refetch();
    },
  };
}
