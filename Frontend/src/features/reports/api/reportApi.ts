import { api } from '@/shared/api/client'
import type { ReportDto, ReportWriteDto, StatusHistoryEntryDto } from '@/shared/api/dto'
import { toReport, toStatusHistoryEntry } from '@/shared/api/mappers'
import type { Report, StatusHistoryEntry } from '@/shared/lib/types'

/** `GET /studies/{id}/reports/current` — bản có `version` lớn nhất. */
export async function fetchCurrentReport(studyId: number, signal?: AbortSignal): Promise<Report | null> {
  try {
    const dto = await api.request<ReportDto>({
      method: 'GET',
      path: `/studies/${studyId}/reports/current`,
      signal,
    })
    return toReport(dto)
  } catch (err) {
    // 404 nghĩa là ca chưa có báo cáo — không phải lỗi, chỉ là chưa ai viết.
    if (typeof err === 'object' && err !== null && (err as { status?: number }).status === 404) return null
    throw err
  }
}

/** `PUT /studies/{id}/reports/current` — lưu nháp, chỉ khi ca đang `READING`. */
export async function saveReportDraft(studyId: number, body: ReportWriteDto): Promise<Report> {
  const dto = await api.request<ReportDto>({
    method: 'PUT',
    path: `/studies/${studyId}/reports/current`,
    body,
  })
  return toReport(dto)
}

// Chuyển trạng thái là vòng đời của **ca chụp**, không riêng gì báo cáo (T2 và T10 không đụng tới
// báo cáo), nên bản cài đặt nằm ở `features/studies/api/studiesApi.ts`. Xuất lại ở đây để
// `useStudyReport` và các chỗ đang import từ `reportApi` không phải sửa.
export { transitionStudy } from '@/features/studies/api/studiesApi'
export type { TransitionResult } from '@/features/studies/api/studiesApi'

/** `GET /studies/{id}/status-history` (IN-06). */
export async function fetchStatusHistory(studyId: number, signal?: AbortSignal): Promise<StatusHistoryEntry[]> {
  const dto = await api.request<StatusHistoryEntryDto[]>({
    method: 'GET',
    path: `/studies/${studyId}/status-history`,
    signal,
  })
  return dto.map(toStatusHistoryEntry)
}
