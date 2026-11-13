import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Thanh thông báo nổi (toast) — góc trên-phải màn hình, tự ẩn sau một khoảng thời gian. Đây là
 * cách bác sĩ biết NGAY "thao tác vừa bấm đã làm được gì" (chuyển nháp sang RIS, ghi audit log…)
 * mà không cần nhìn lại bên trong AI Panel. `position: fixed` nên thoát khỏi khung AI Panel
 * (width 320px, cạnh phải viewport — doc/11-ai-design.md mục 5.1) để không bị cắt chữ.
 */
export type ToastKind = 'success' | 'warning'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const DURATION_MS = 3500

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts(list => list.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++
      setToasts(list => [...list, { id, kind, message }])
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION_MS))
    },
    [dismiss],
  )

  // Dọn mọi timer còn treo khi AiPanel unmount — tránh gọi setState trên component đã gỡ.
  useEffect(() => {
    const map = timers.current
    return () => map.forEach(timer => clearTimeout(timer))
  }, [])

  return { toasts, push, dismiss }
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(t => (
        <button key={t.id} type="button" className={`toast ${t.kind}`} onClick={() => onDismiss(t.id)}>
          {t.message}
        </button>
      ))}
    </div>
  )
}
