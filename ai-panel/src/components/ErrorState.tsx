import { useEffect, useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { StatusNote } from './StatusNote'
import { formatDateTime } from '@/lib/format'

/**
 * `ai_status = FAILED` / `TIMEOUT` — doc/11-ai-design.md mục 5.2.4. Không hiện mã lỗi kỹ thuật
 * (`error_reason`) cho bác sĩ dưới bất kỳ hình thức nào — chỉ dùng nội bộ (log console).
 * Nút "Thử phân tích lại" chỉ là PLACEHOLDER (nhiệm vụ yêu cầu rõ) vì chưa có AI Backend thật để
 * gọi lại — bấm vào chỉ hiện ghi chú, không gửi yêu cầu xử lý lại nào.
 */
export function ErrorState({
  kind,
  modelName,
  modelVersion,
  completedAt,
  errorReason,
}: {
  kind: 'failed' | 'timeout'
  modelName: string
  modelVersion: string
  completedAt: string | null
  /** Chỉ dùng để log nội bộ — không render ra UI (xem docstring trên). */
  errorReason: string | null
}) {
  const [showPlaceholderNote, setShowPlaceholderNote] = useState(false)

  useEffect(() => {
    if (errorReason) console.debug(`[AI Panel] ai_status=${kind.toUpperCase()} error_reason=`, errorReason)
  }, [errorReason, kind])

  return (
    <>
      <StatusBadge kind={kind} />
      <div className="meta-line">
        {modelName} v{modelVersion} ·{' '}
        {kind === 'failed' ? formatDateTime(completedAt) : 'không phản hồi sau thời gian chờ'}
      </div>
      <div className="body-text strong">
        {kind === 'failed' ? 'AI không trả được kết quả cho ca này.' : 'AI không phản hồi cho ca này.'}
      </div>
      <div className="body-text">Vui lòng đọc ảnh như bình thường.</div>
      <button type="button" className="retry-btn" onClick={() => setShowPlaceholderNote(true)}>
        ↻ Thử phân tích lại
      </button>
      {showPlaceholderNote && (
        <StatusNote
          kind="warning"
          message="Chưa có AI Backend thật trong phạm vi đồ án này (H-04, [HOÃN]) — nút này chỉ minh hoạ vị trí, chưa gọi xử lý lại được."
        />
      )}
    </>
  )
}
