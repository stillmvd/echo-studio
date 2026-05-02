import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

interface Props {
  body: string;
}

export function Markdown({ body }: Props) {
  return (
    <article className="echo-markdown text-sm leading-relaxed text-[var(--color-text-secondary)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
      >
        {body}
      </ReactMarkdown>
    </article>
  );
}
