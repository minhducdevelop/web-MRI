import type { StudyStatus } from './types'

export interface StatusMeta {
  key: StudyStatus
  label: string
  color: string
  bg: string
  /** Hình dáng chấm trạng thái trong danh sách bộ lọc. */
  shape: 'clock' | 'dot' | 'ring' | 'check' | 'square' | 'cross'
}

/** Nhãn tiếng Việt cho 7 mã trạng thái của ERD (`doc/02-erd.md` mục 4.5). */
export const STATUS_META: Record<StudyStatus, StatusMeta> = {
  SCHEDULED: { key: 'SCHEDULED', label: 'Chờ thực hiện', color: 'var(--color-st-cho)', bg: '#f3f4f6', shape: 'clock' },
  UNREAD: { key: 'UNREAD', label: 'Chưa đọc', color: 'var(--color-st-chuadoc)', bg: '#fdecec', shape: 'square' },
  READING: { key: 'READING', label: 'Đang đọc', color: 'var(--color-st-dangdoc)', bg: '#e8f0fe', shape: 'dot' },
  READ: { key: 'READ', label: 'Đọc xong', color: 'var(--color-st-docxong)', bg: '#e3f5f9', shape: 'dot' },
  APPROVING: { key: 'APPROVING', label: 'Đang duyệt', color: 'var(--color-st-dangduyet)', bg: '#fdf4e3', shape: 'ring' },
  APPROVED: { key: 'APPROVED', label: 'Duyệt xong', color: 'var(--color-st-duyetxong)', bg: '#e6f5ef', shape: 'check' },
  CANCELLED: { key: 'CANCELLED', label: 'Đã hủy', color: 'var(--color-st-huy)', bg: '#f3f4f6', shape: 'cross' },
}

export const STATUS_ORDER: StudyStatus[] = [
  'SCHEDULED', 'UNREAD', 'READING', 'READ', 'APPROVING', 'APPROVED', 'CANCELLED',
]

/** Tab "Chờ" chỉ gồm ca chưa chụp xong; còn lại nằm ở tab "Đã thực hiện" (openapi `tab`). */
export const PENDING_STATUSES: StudyStatus[] = ['SCHEDULED']

/**
 * Tab "Đã thực hiện" = mọi trạng thái trừ `SCHEDULED`, đúng mô tả tham số `tab` trong
 * `openapi.yaml`. `CANCELLED` nằm ở đây để ca đã hủy vẫn tra cứu được, không biến mất khỏi
 * giao diện (`doc/12` TC-16 yêu cầu đếm đủ 7 nhóm).
 */
export const DONE_STATUSES: StudyStatus[] = STATUS_ORDER.filter(s => s !== 'SCHEDULED')

export function isStudyStatus(value: string): value is StudyStatus {
  return value in STATUS_META
}
