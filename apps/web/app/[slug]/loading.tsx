import { Skeleton } from '@/components/Skeleton';

export default function Loading(): React.ReactElement {
  return (
    <main className="min-h-screen bg-corpus-bg bg-grid">
      <nav className="flex items-center justify-between px-8 py-5">
        <span className="font-mono text-corpus-text text-sm">corpus</span>
      </nav>

      <div className="max-w-4xl mx-auto px-8">
        <div className="pt-20 text-center">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto mt-3" />
        </div>

        <div className="flex justify-center mt-20">
          <Skeleton className="w-[300px] h-[300px] rounded-full" />
        </div>

        <Skeleton className="h-4 w-40 mx-auto mt-8" />

        <Skeleton className="h-[120px] w-full max-w-[800px] mx-auto mt-12 rounded-lg" />

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-3 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <div className="lg:col-span-2 space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
