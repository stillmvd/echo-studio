import { Group, Panel, useDefaultLayout } from 'react-resizable-panels';
import { ScopePanel } from '@/components/tooling/ScopePanel';
import { ToolList } from '@/components/tooling/ToolList';
import { useToolScan, useToolScopes } from '@/hooks/use-tooling';
import { useUiStore } from '@/state/ui-store';
import { PanelSeparator, panelCard } from './panels';

export function ToolsLayout() {
  const scopePath = useUiStore((s) => s.toolsScope);
  const setScopePath = useUiStore((s) => s.setToolsScope);
  const layout = useDefaultLayout({ id: 'echo-studio.tools.panel-sizes', storage: localStorage });

  const scopes = useToolScopes();
  const known = scopes.data?.find((s) => s.kind === 'project' && s.path === scopePath);
  const scope = known ??
    scopes.data?.[0] ?? { kind: 'global', path: null, name: 'Global', available: true };
  const scan = useToolScan({ kind: scope.kind, path: scope.path });
  const global = useToolScan({ kind: 'global', path: null });

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

      <Panel defaultSize="73" minSize="40" className={panelCard}>
        <ToolList
          scope={scope}
          scan={scope.available ? scan.data : undefined}
          isLoading={scope.available && (scan.isLoading || scopes.isLoading)}
          error={scan.error ?? scopes.error}
          onRetry={() => {
            void scopes.refetch();
            void scan.refetch();
          }}
        />
      </Panel>
    </Group>
  );
}
