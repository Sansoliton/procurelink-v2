import { FileText, X } from 'lucide-react'

type PDFViewerModalProps = {
  title: string
  url: string
  onClose: () => void
}

export default function PDFViewerModal({ title, url, onClose }: PDFViewerModalProps) {
  const isImage = /^data:image|\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?|$)/i.test(url)

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-5xl" style={{ height: '90vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <h3 className="text-sm font-semibold text-gray-800 truncate">{title}</h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <a
              href={url}
              download={title}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-2.5 py-1 hover:bg-blue-50 transition-colors"
            >
              Download
            </a>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-gray-100 rounded-b-xl">
          {isImage
            ? <img src={url} alt={title} className="w-full h-full object-contain p-4" />
            : <iframe src={url} title={title} className="w-full h-full border-0 rounded-b-xl" />
          }
        </div>
      </div>
    </div>
  )
}
