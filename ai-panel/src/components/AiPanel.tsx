import { useState } from 'react'
import type { AiService } from '@/services/aiService'
import type { RisBridge } from '@/integration/risBridge'
import { useAiAnalysis } from '@/hooks/useAiAnalysis'
import { StatusBadge, type AiStatusBadgeKind } from './StatusBadge'
import { NotTriggeredState } from './NotTriggeredState'
import { PendingState } from './PendingState'
import { ErrorState } from './ErrorState'
import { ReadyState } from './ReadyState/ReadyState'
import { useToasts, ToastStack } from './ToastStack'

/**
 * Container AI Panel — doc/11-ai-design.md mục 5. Component độc lập (xem README.md): nhận
 * `aiService`/`risBridge` qua props thay vì tự khởi tạo, để cắm được vào một OHIF extension
 * thật sau này (chỉ đổi nơi gọi `<AiPanel .../>`, không đổi component) hoặc chạy trong DemoApp.
 *
 * Vị trí/khung (cạnh phải OHIF, đóng/mở được, không che vùng xem ảnh chính — mục 5.1) là việc
 * của `panelService` khi cắm thật vào OHIF, KHÔNG phải việc component này tự định vị.
 */
export function AiPanel({
  studyInstanceUid,
  aiService,
  risBridge,
  previouslyReviewed = false,
}: {
  studyInstanceUid: string
  aiService: AiService
  risBridge: RisBridge
  previouslyReviewed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { analysis, loading, refresh } = useAiAnalysis(studyInstanceUid, aiService)
  // Toast góc trên-phải — "vừa bấm nút nào, làm được gì" (xem ToastStack.tsx). Đặt ở đây (không
  // phải trong ReadyState) để còn hiện được cả khi panel bị thu gọn (`collapsed`).
  const { toasts, push: notify, dismiss: dismissToast } = useToasts()

  const badgeKind = badgeKindOf(analysis, loading)

  if (collapsed) {
    return (
      <>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <div className="ai-panel" style={{ width: 'auto' }}>
          <button type="button" className="collapse" title="Mở rộng" onClick={() => setCollapsed(false)}>
            <AiSparkleIcon />
          </button>
          <StatusBadge kind={badgeKind} />
        </div>
      </>
    )
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="ai-panel">
        <div className="ai-head">
          <div className="title">
            <AiSparkleIcon />
            AI Panel
          </div>
          <button type="button" className="collapse" title="Thu gọn" onClick={() => setCollapsed(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
        </div>

        {loading && analysis === undefined && (
          <div className="spin-row">
            <div className="spinner" />
            <div className="body-text">Đang tải trạng thái AI…</div>
          </div>
        )}

        {!loading && analysis === null && <NotTriggeredState />}

        {analysis && analysis.status === 'PENDING' && <PendingState onRefresh={refresh} refreshing={loading} />}

        {analysis && (analysis.status === 'FAILED' || analysis.status === 'TIMEOUT') && (
          <ErrorState
            kind={analysis.status === 'FAILED' ? 'failed' : 'timeout'}
            modelName={analysis.model_name}
            modelVersion={analysis.model_version}
            completedAt={analysis.completed_at}
            errorReason={analysis.error_reason}
          />
        )}

        {analysis && analysis.status === 'READY' && (
          <ReadyState analysis={analysis} risBridge={risBridge} previouslyReviewed={previouslyReviewed} onNotify={notify} />
        )}
      </div>
    </>
  )
}

function badgeKindOf(analysis: ReturnType<typeof useAiAnalysis>['analysis'], loading: boolean): AiStatusBadgeKind {
  if (analysis === undefined) return loading ? 'pending' : 'idle'
  if (analysis === null) return 'idle'
  switch (analysis.status) {
    case 'PENDING':
      return 'pending'
    case 'READY':
      return 'ready'
    case 'FAILED':
      return 'failed'
    case 'TIMEOUT':
      return 'timeout'
  }
}

function AiSparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
