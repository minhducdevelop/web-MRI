import { STATUS_META } from '@/shared/lib/status'
import type { StudyStatus } from '@/shared/lib/types'

/** Chấm trạng thái: mỗi trạng thái một hình riêng để phân biệt được cả khi in đen trắng. */
export function StatusGlyph({ status, size = 12 }: { status: StudyStatus; size?: number }) {
  const m = STATUS_META[status]
  const common = { width: size, height: size, viewBox: '0 0 16 16', style: { color: m.color } }

  switch (m.shape) {
    case 'clock':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4.5 2h7M4.5 14h7M5 2c0 3 6 3 6 0M5 14c0-3 6-3 6 0" />
        </svg>
      )
    case 'square':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
          <path d="M8 5.2v4" strokeLinecap="round" />
          <path d="M8 11.2h.01" strokeLinecap="round" />
        </svg>
      )
    case 'dot':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.6" />
          <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'ring':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="8" cy="8" r="5.6" strokeDasharray="4.2 3" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.8" />
          <path d="m5.5 8.2 1.8 1.8 3.3-3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'cross':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.8" />
          <path d="m5.9 5.9 4.2 4.2M10.1 5.9l-4.2 4.2" strokeLinecap="round" />
        </svg>
      )
  }
}

/** Nhãn trạng thái đầy đủ dùng trong cột "Trạng thái" của tab Đã thực hiện. */
export function StatusChip({ status }: { status: StudyStatus }) {
  const m = STATUS_META[status]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium" style={{ color: m.color }}>
      <StatusGlyph status={status} />
      {m.label}
    </span>
  )
}
