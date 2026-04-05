export function Skeleton({ className = '' }: { className?: string }): React.ReactElement {
  return (
    <div
      className={`bg-corpus-line rounded animate-pulse ${className}`}
    />
  );
}
