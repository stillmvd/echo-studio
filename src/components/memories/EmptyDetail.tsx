export function EmptyDetail({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div>
        <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
      </div>
    </div>
  );
}
