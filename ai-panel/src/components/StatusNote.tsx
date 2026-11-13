/**
 * Thông báo kết quả một thao tác (handoff sang RIS, ghi audit log, xem gợi ý…) — dùng chung cho
 * `ActionButtons` và `ReadyState` để bác sĩ biết CHẮC thao tác đã ghi được hay chưa, không chỉ
 * "đã bấm nút". `kind` quyết định màu: 'success' khi mọi phần đều ghi được, 'warning' khi có
 * phần KHÔNG ghi được (ví dụ audit log không chuyển tiếp được tới RIS — xem risBridge.ts).
 */
export type StatusNoteKind = 'success' | 'warning'

export function StatusNote({ kind, message }: { kind: StatusNoteKind; message: string }) {
  return (
    <p className={`status-note ${kind}`} role="status">
      {message}
    </p>
  )
}
