/**
 * Ba lựa chọn — đúng mục 4.2 và mục 5.2.5.d của doc/11-ai-design.md. KHÔNG có nút "Lưu" trong
 * AI Panel: lưu luôn là hành động trên form báo cáo chính (`ReportModal`), để `report.origin`
 * được backend RIS tính đúng lúc lưu — AI Panel/client KHÔNG tự khai `origin`.
 *
 * Kết quả của thao tác (chuyển nháp sang RIS + ghi audit log) hiện qua TOAST góc trên-phải
 * (`ReadyState.handoff()` → `onNotify`), không hiện ở đây — xem `components/ToastStack.tsx`.
 */
export function ActionButtons({
  onUseAsIs,
  onEditBeforeUse,
  onDismiss,
  pending,
}: {
  onUseAsIs: () => void
  onEditBeforeUse: () => void
  onDismiss: () => void
  pending: boolean
}) {
  return (
    <div className="actions">
      <button type="button" className="btn btn-primary" disabled={pending} onClick={onUseAsIs}>
        ✓ Dùng gợi ý này
      </button>
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={onEditBeforeUse}>
          ✎ Sửa trước khi dùng
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onDismiss}>
          ✕ Bỏ qua gợi ý
        </button>
      </div>
    </div>
  )
}
