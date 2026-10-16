import { AI_LIMITS, type AITree } from '../../../../shared/ai'
export function AIPreview({ tree }: { tree: AITree }) {
  return (
    <ul className="grid gap-1 border-l border-border pl-4 text-sm" aria-label="AI 生成预览">
      <PreviewNode tree={tree} depth={1} />
    </ul>
  )
}
function PreviewNode({ tree, depth }: { tree: AITree; depth: number }) {
  if (depth > AI_LIMITS.depth) return null
  return (
    <li>
      <p className="whitespace-pre-wrap break-words py-1">{tree.title}</p>
      {tree.children.length > 0 && (
        <ul className="border-l border-border pl-4">
          {tree.children.map((child, index) => (
            <PreviewNode key={index} tree={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
