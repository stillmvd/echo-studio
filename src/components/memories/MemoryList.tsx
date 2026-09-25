import { useVirtualizer } from '@tanstack/react-virtual';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { menuPoint } from '@/lib/context-menu';
import type { Memory } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { MemoryRow } from './MemoryRow';

interface Props {
  items: Memory[];
  total: number;
  isLoading: boolean;
  highlightTerms: string[];
}

const ROW_HEIGHT = 64;

export function MemoryList({ items, total, isLoading, highlightTerms }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedMemoryId = useUiStore((s) => s.selectedMemoryId);
  const setSelectedMemoryId = useUiStore((s) => s.setSelectedMemoryId);
  const selectedProject = useUiStore((s) => s.selectedProject);
  const selectedCategory = useUiStore((s) => s.selectedCategory);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const bulkSelectionIds = useUiStore((s) => s.bulkSelectionIds);
  const toggleBulkId = useUiStore((s) => s.toggleBulkId);
  const setBulkSelection = useUiStore((s) => s.setBulkSelection);
  const runAction = useUiStore((s) => s.requestMemoryAction);
  const [menu, setMenu] = useState<{ x: number; y: number; memory: Memory } | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll on filter change
  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [selectedProject, selectedCategory, searchQuery]);

  const allChecked = items.length > 0 && items.every((m) => bulkSelectionIds.includes(m.id));
  const someChecked = bulkSelectionIds.length > 0 && !allChecked;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked;
            }}
            onChange={() => {
              if (allChecked || someChecked) setBulkSelection([]);
              else setBulkSelection(items.map((m) => m.id));
            }}
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
          />
          <span>
            {items.length} of {total} {total === 1 ? 'memory' : 'memories'}
          </span>
        </label>
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
                    highlightTerms={highlightTerms}
                    bulkChecked={bulkSelectionIds.includes(memory.id)}
                    onToggleBulk={() => toggleBulkId(memory.id)}
                    menuOpen={menu?.memory.id === memory.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ ...menuPoint(e), memory });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Edit',
              icon: <Pencil className="h-3.5 w-3.5" />,
              onSelect: () => runAction(menu.memory.id, 'edit'),
            },
            menu.memory.status === 'archived'
              ? {
                  label: 'Restore',
                  icon: <ArchiveRestore className="h-3.5 w-3.5" />,
                  onSelect: () => runAction(menu.memory.id, 'restore'),
                }
              : {
                  label: 'Archive',
                  icon: <Archive className="h-3.5 w-3.5" />,
                  onSelect: () => runAction(menu.memory.id, 'archive'),
                },
            'separator',
            {
              label: 'Delete',
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              onSelect: () => runAction(menu.memory.id, 'delete'),
            },
          ]}
        />
      )}
    </div>
  );
}
