import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import type { Memory } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { MemoryRow } from './MemoryRow';

interface Props {
  items: Memory[];
  total: number;
  isLoading: boolean;
}

const ROW_HEIGHT = 64;

export function MemoryList({ items, total, isLoading }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedMemoryId = useUiStore((s) => s.selectedMemoryId);
  const setSelectedMemoryId = useUiStore((s) => s.setSelectedMemoryId);
  const selectedProject = useUiStore((s) => s.selectedProject);
  const selectedCategory = useUiStore((s) => s.selectedCategory);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll on filter change
  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [selectedProject, selectedCategory]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
        <span>
          {items.length} of {total} {total === 1 ? 'memory' : 'memories'}
        </span>
        <span>sorted by updated ↓</span>
      </div>
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm text-[var(--color-text-muted)]">
            No memories match the current filters.
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vrow) => {
              const memory = items[vrow.index];
              if (!memory) return null;
              return (
                <div
                  key={memory.id}
                  data-index={vrow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vrow.start}px)`,
                  }}
                >
                  <MemoryRow
                    memory={memory}
                    selected={selectedMemoryId === memory.id}
                    onClick={() => setSelectedMemoryId(memory.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
