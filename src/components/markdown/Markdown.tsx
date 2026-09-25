import { open } from '@tauri-apps/plugin-shell';
import { type ComponentProps, lazy, Suspense } from 'react';
import { cn } from '@/lib/cn';

function ExternalLink({ href, children, ...rest }: ComponentProps<'a'>) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href && /^(https?|mailto):/i.test(href)) void open(href);
      }}
    >
      {children}
    </a>
  );
}

const ReactMarkdownLazy = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: rehypeHighlight }, { default: remarkGfm }] =
    await Promise.all([import('react-markdown'), import('rehype-highlight'), import('remark-gfm')]);
  return {
    default: ({ body }: { body: string }) => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{ a: ExternalLink }}
      >
        {body}
      </ReactMarkdown>
    ),
  };
});

interface Props {
  body: string;
  className?: string;
}

export function Markdown({ body, className }: Props) {
  return (
    <article
      className={cn(
        'echo-markdown text-sm leading-relaxed text-[var(--color-text-secondary)]',
        className,
      )}
    >
      <Suspense fallback={<pre className="whitespace-pre-wrap font-sans">{body}</pre>}>
        <ReactMarkdownLazy body={body} />
      </Suspense>
    </article>
  );
}
