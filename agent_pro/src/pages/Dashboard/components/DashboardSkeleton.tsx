import { Skeleton } from '../../../components/common/LoadingState'

/** Shown while the workspace data loads. Stat cards render their own loading state. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="grid grid-cols-3 gap-6 @max-[56rem]:grid-cols-1">
      <div className="col-span-2 space-y-6 @max-[56rem]:col-span-1">
        <div>
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[4.5rem]" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="mb-3 h-4 w-44" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-48" />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}
