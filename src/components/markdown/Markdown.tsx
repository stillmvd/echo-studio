import { lazy, Suspense } from 'react';

const ReactMarkdownLazy = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: rehypeHighlight }, { default: remarkGfm }] =
    await Promise.all([import('react-markdown'), import('rehype-highlight'), import('remark-gfm')]);
  return {
    default: ({ body }: { body: string }) => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
      >
        {body}
      </ReactMarkdown>
    ),
  };
});

interface Props {
  body: string;
}

export function Markdown({ body }: Props) {
  return (
    <article className="echo-markdown text-sm leading-relaxed text-[var(--color-text-secondary)]">
      <Suspense fallback={<pre className="whitespace-pre-wrap font-sans">{body}</pre>}>
        <ReactMarkdownLazy body={body} />
      </Suspense>
    </article>
  );
}
