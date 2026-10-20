import { useEffect, useRef } from 'react';
import { fitTerm, logEntry, mount, startTail, unmount } from './terminals';

interface Props {
  tabKey: string;
  projectPath: string;
  visible: boolean;
}

export function LogTerminal({ tabKey, projectPath, visible }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const entry = logEntry(tabKey);

  useEffect(() => {
    startTail(tabKey, projectPath);
  }, [tabKey, projectPath]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    mount(entry, el);
    const ro = new ResizeObserver(() => fitTerm(entry));
    ro.observe(el);
    return () => {
      ro.disconnect();
      unmount(entry);
    };
  }, [entry]);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => fitTerm(entry));
    return () => cancelAnimationFrame(raf);
  }, [visible, entry]);

  return (
    <div className="wb-tw" hidden={!visible}>
      <div ref={ref} className="wb-term" />
    </div>
  );
}
