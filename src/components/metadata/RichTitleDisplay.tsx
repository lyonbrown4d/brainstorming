import Markdown from 'react-markdown'

/** Inline portable formatting only; raw HTML, links and embedded resources are omitted. */
export const RichTitleDisplay = ({ source }: { source: string }) => {
  return (
    <Markdown
      skipHtml
      allowedElements={['p', 'strong', 'em', 'del', 'code', 'br']}
      unwrapDisallowed
      components={{ p: ({ children }) => <>{children}</> }}
    >
      {source}
    </Markdown>
  )
}

export default RichTitleDisplay
