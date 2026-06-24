import { FileText, X, ExternalLink } from 'lucide-react'

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
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-2.5 py-1 hover:bg-blue-50 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open in new tab
            </a>
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
          {isImage ? (
            <img src={url} alt={title} className="w-full h-full object-contain p-4" />
          ) : (
            /* <object> is more reliable than <iframe> for PDF MIME type across browsers */
            <object
              data={url}
              type="application/pdf"
              className="w-full h-full rounded-b-xl"
            >
              {/* Fallback when browser cannot display PDF inline */}
              <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                <FileText className="w-12 h-12 text-gray-300" />
                <p className="text-sm">Your browser cannot display this PDF inline.</p>
                <div className="flex gap-3">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Open in new tab
                  </a>
                  <a
                    href={url}
                    download={title}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Download
                  </a>
                </div>
              </div>
            </object>
          )}
        </div>
      </div>
    </div>
  )
}
