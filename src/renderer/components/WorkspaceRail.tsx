import { useEffect, useState } from 'react'
import { BrainCircuit, FolderOpen, History, ListTree, Plus, X } from 'lucide-react'
import type { RecentFile } from '@shared/contracts'
import { useEditor } from '../state/editor'
import { newDocument, openDocument } from '../state/files'
export function WorkspaceRail() {
  const [recent, setRecent] = useState<RecentFile[] | null>(null)
  const recentOpen = recent !== null
  useEffect(() => {
    if (!recentOpen || !window.trelyx) return
    void window.trelyx
      .getRecentFiles()
      .then(setRecent)
      .catch(() => {
        useEditor.getState().setError('无法读取最近文件，请使用打开导图。')
      })
  }, [recentOpen])
  return (
    <>
      <nav className="workspace-rail" aria-label="工作空间">
        <div className="brand-mark" title="Trelyx">
          <BrainCircuit size={25} strokeWidth={1.65} />
        </div>
        <span className="rail-divider" />
        <button
          className="rail-button active"
          aria-label="显示导图"
          title="思维导图"
          onClick={() => {
            useEditor.setState({ outlineOpen: false })
          }}
        >
          <BrainCircuit size={20} />
        </button>
        <button
          className="rail-button"
          aria-label="切换大纲"
          title="文档大纲"
          onClick={() => {
            useEditor.setState((state) => ({ outlineOpen: !state.outlineOpen }))
          }}
        >
          <ListTree size={20} />
        </button>
        <button
          className="rail-button"
          aria-label="最近文件"
          title="最近文件"
          onClick={() => {
            setRecent(recent === null ? [] : null)
          }}
        >
          <History size={20} />
        </button>
        <span className="rail-spacer" />
        <button
          className="rail-button"
          aria-label="创建新导图"
          title="新建导图"
          onClick={newDocument}
        >
          <Plus size={20} />
        </button>
        <div className="profile-badge" title="本地工作空间">
          T
        </div>
      </nav>
      {recent !== null && (
        <aside className="recent-panel" aria-label="最近文件列表">
          <div className="panel-heading">
            <span>最近文件</span>
            <button
              aria-label="关闭最近文件"
              onClick={() => {
                setRecent(null)
              }}
            >
              <X size={16} />
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="muted">
              {window.trelyx
                ? '还没有最近打开的文件。'
                : '浏览器预览支持打开和下载文件。桌面版会在这里记住最近文件。'}
            </p>
          ) : (
            recent.map((file) => (
              <button
                className="recent-file"
                key={file.path}
                onClick={() => {
                  void openDocument(file.path)
                  setRecent(null)
                }}
              >
                <FolderOpen size={16} />
                <span>{file.name}</span>
              </button>
            ))
          )}
          <button
            className="inspector-edit"
            onClick={() => {
              void openDocument()
              setRecent(null)
            }}
          >
            <FolderOpen size={14} /> 打开本地文件
          </button>
        </aside>
      )}
    </>
  )
}
