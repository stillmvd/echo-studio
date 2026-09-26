import { useCallback, useEffect, useState } from 'react';
import { Group, Panel, useDefaultLayout } from 'react-resizable-panels';
import { ScopePanel } from '@/components/tooling/ScopePanel';
import { ToolDetail } from '@/components/tooling/ToolDetail';
import { ToolList } from '@/components/tooling/ToolList';
import { useToolScan, useToolScopes } from '@/hooks/use-tooling';
import type { ScopeRef, ToolItem } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { PanelSeparator, panelCard } from './panels';

const GLOBAL: ScopeRef = { kind: 'global', path: null, name: 'Global', available: true };

export function ToolsLayout() {
  const scopePath = useUiStore((s) => s.toolsScope);
  const setScopePath = useUiStore((s) => s.setToolsScope);
  const selectedId = useUiStore((s) => s.selectedToolId);
  const setSelectedId = useUiStore((s) => s.setSelectedToolId);
  const layout = useDefaultLayout({ id: 'echo-studio.tools.panel-sizes', storage: localStorage });

  const scopes = useToolScopes();
  const known = scopes.data?.find((s) => s.kind === 'project' && s.path === scopePath);
  const scope = known ?? scopes.data?.[0] ?? GLOBAL;
  const scan = useToolScan({ kind: scope.kind, path: scope.path });
  const global = useToolScan({ kind: 'global', path: null });

  const items = scope.available ? (scan.data?.items ?? []) : [];
  const current = selectedId ? items.find((i) => i.id === selectedId) : undefined;
  const [last, setLast] = useState<ToolItem | null>(null);
  useEffect(() => {
    if (current) setLast(current);
    else if (!selectedId) setLast(null);
  }, [current, selectedId]);
  const shown = current ?? (selectedId && last?.id === selectedId && scan.data ? last : null);
  const close = useCallback(() => setSelectedId(null), [setSelectedId]);

  return (
    <Group orientation="horizontal" {...layout}>
      <Panel defaultSize="27" minSize="18" className={panelCard}>
        <ScopePanel
          scopes={scopes.data ?? []}
          selectedPath={scope.path}
          globalCount={global.data?.items.length}
          onSelect={setScopePath}
        />
      </Panel>

      <PanelSeparator />

      <Panel defaultSize="73" minSize="40">
        <div
          className={
            shown
              ? 'grid h-full grid-cols-[minmax(240px,1fr)_minmax(360px,40%)] gap-2'
              : 'grid h-full grid-cols-1'
          }
        >
          <div className={panelCard}>
            <ToolList
              scope={scope}
              scan={scope.available ? scan.data : undefined}
              isLoading={scope.available && (scan.isLoading || scopes.isLoading)}
              error={scan.error ?? scopes.error}
              compact={shown !== null}
              onRetry={() => {
                void scopes.refetch();
                void scan.refetch();
              }}
            />
          </div>
          {shown && (
            <div className={panelCard}>
              <ToolDetail
                key={shown.id}
                item={shown}
                removed={!current}
                items={items}
                scopePath={scope.path}
                onClose={close}
              />
            </div>
          )}
        </div>
      </Panel>
    </Group>
  );
}
