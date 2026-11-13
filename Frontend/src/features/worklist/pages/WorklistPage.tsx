import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClinicalModal } from '@/features/clinical/components/ClinicalModal'
import { saveBlob } from '@/features/printing/api/printApi'
import { PrintModal } from '@/features/printing/components/PrintModal'
import { printHtml } from '@/features/printing/lib/printSheet'
import { ReportModal } from '@/features/reports/components/ReportModal'
import { fetchCurrentReport } from '@/features/reports/api/reportApi'
import { AddStudyModal } from '@/features/studies/components/AddStudyModal'
import { UpdateFromHisModal } from '@/features/studies/components/UpdateFromHisModal'
import { UpdateStudyModal } from '@/features/studies/components/UpdateStudyModal'
import { openStudyViewer } from '@/features/studies/api/viewerApi'
import { useAuth, useCurrentUser } from '@/features/auth/hooks/useAuth'
import { useAsync } from '@/shared/hooks/useAsync'
import { StudyTransitionDialog } from '@/features/studies/components/StudyTransitionDialog'
import { type Permission, can, deniedReason } from '@/shared/lib/auth'
import { TRANSITIONS, type Transition } from '@/shared/lib/stateMachine'
import type { StudyStatus, TimeField, WorklistRow, WorklistTab } from '@/shared/lib/types'
import { Button, Select, cx } from '@/shared/ui/controls'
import { Download, Printer, Warning } from '@/shared/ui/Icon'
import { DEFAULT_SIDEBAR_FILTERS, Sidebar, type SidebarFilters } from '../components/Sidebar'
import { Pagination } from '../components/Pagination'
import { PatientPanel } from '../components/PatientPanel'
import { RelatedOrders } from '../components/RelatedOrders'
import { TopBar, type TopBarState } from '../components/TopBar'
import {
  WorklistTable, useOptionalColumns, type ColumnFilters, type ColumnKey,
} from '../components/WorklistTable'
import { downloadStudiesCsv, logListExportEvent } from '../api/exportApi'
import { fetchWorklist, type WorklistFilters } from '../api/worklistApi'
import { useReferenceData, useStatusCounts, useWorklist } from '../hooks/useWorklist'
import { buildWorklistPrintHtml } from '../lib/listPrintSheet'

const PENDING_COLUMNS: ColumnKey[] = [
  'index', 'patientCode', 'fullName', 'dob', 'age', 'gender', 'service', 'orderingDoctor',
  'bodyPart', 'conclusion', 'groupCode', 'groupName', 'recordCode', 'specimenCode', 'archiveCode',
]

const DONE_COLUMNS: ColumnKey[] = [
  'index', 'status', 'patientInfo', 'service', 'scannedAt', 'startedAt', 'completedAt',
  'orderingDoctor', 'conclusion', 'bodyPart', 'groupCode', 'groupName', 'recordCode',
  'specimenCode', 'archiveCode',
]

const DEFAULT_TOPBAR: TopBarState = {
  patientCode: '',
  patientName: '',
  visitCode: '',
  dateFrom: '',
  dateTo: '',
  timeField: 'SCHEDULED',
}

const EMPTY_COLUMN_FILTERS: ColumnFilters = {
  patientCode: '', fullName: '', orderCode: '', visitCode: '',
}

const EXPORT_ALL_FILTERS: WorklistFilters = {
  tab: '',
  timeField: 'SCHEDULED',
  dateFrom: '',
  dateTo: '',
  statuses: [],
  departmentIds: [],
  deviceIds: [],
  modality: '',
  patientClass: '',
  patientCode: '',
  fullName: '',
  visitCode: '',
  orderCode: '',
  page: 1,
  pageSize: 5000,
  sort: '',
}

export function WorklistPage() {
  const user = useCurrentUser()
  const { signOut, forbiddenMessage, reportForbidden, clearForbidden } = useAuth()

  const [tab, setTab] = useState<WorklistTab>('PENDING')
  const [topbar, setTopbar] = useState<TopBarState>(DEFAULT_TOPBAR)
  const [filters, setFilters] = useState<SidebarFilters>(DEFAULT_SIDEBAR_FILTERS)
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_COLUMN_FILTERS)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const { visible: optionalCols, toggle: toggleOptional } = useOptionalColumns()
  const [columnFilterMode, setColumnFilterMode] = useState(false)
  const [modal, setModal] = useState<null | 'ADD' | 'UPDATE' | 'HIS' | 'CLINICAL' | 'REPORT' | 'PRINT'>(null)
  // Bước chuyển trạng thái gọi thẳng từ panel (T2 Task 10, T10 Task 9); null = không mở hộp thoại.
  const [pendingTransition, setPendingTransition] = useState<Transition | null>(null)
  const [busyExport, setBusyExport] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const reference = useReferenceData()
  const counts = useStatusCounts(refreshKey)

  /* ------------------------- Tab mặc định theo vai trò (đăng nhập lần đầu) */
  // RADIOLOGIST → "Chưa đọc" (UNREAD); APPROVER → "Đọc xong" (READ) hoặc "Đang duyệt" (APPROVING),
  // chọn tab có nhiều ca hơn, mặc định READ nếu chưa xác định được. CLINICIAN/TECHNICIAN/ADMIN
  // giữ tab đầu tiên hiện tại ('PENDING'). Chỉ áp dụng một lần lúc vào worklist, không ghi đè
  // lựa chọn tab sau đó của người dùng. Vai trò lấy từ `useCurrentUser()` — cùng nguồn `auth.ts`.
  const appliedRoleDefaultTab = useRef(false)
  useEffect(() => {
    if (appliedRoleDefaultTab.current) return
    if (user.roles.includes('RADIOLOGIST')) {
      appliedRoleDefaultTab.current = true
      setTab('DONE')
      setFilters(f => ({ ...f, statuses: ['UNREAD'] }))
    } else if (user.roles.includes('APPROVER')) {
      if (!counts.data) return // chờ số đếm trạng thái tải xong để biết tab nào nhiều ca hơn
      appliedRoleDefaultTab.current = true
      const target: StudyStatus = (counts.data.byStatus.APPROVING ?? 0) > (counts.data.byStatus.READ ?? 0)
        ? 'APPROVING'
        : 'READ'
      setTab('DONE')
      setFilters(f => ({ ...f, statuses: [target] }))
    } else {
      appliedRoleDefaultTab.current = true
    }
  }, [user.roles, counts.data])

  /* ------------------------------------------------- Bộ lọc gửi lên API */

  const worklistFilters = useMemo<WorklistFilters>(() => ({
    tab,
    timeField: topbar.timeField,
    dateFrom: topbar.dateFrom,
    dateTo: topbar.dateTo,
    // Tab "Chờ" chỉ có SCHEDULED nên không gửi kèm bộ lọc trạng thái của sidebar.
    statuses: tab === 'DONE' ? filters.statuses : [],
    departmentIds: [],
    deviceIds: filters.deviceIds,
    modality: filters.modality,
    patientClass: filters.patientClass,
    patientCode: columnFilters.patientCode || topbar.patientCode,
    fullName: columnFilters.fullName || topbar.patientName,
    visitCode: columnFilters.visitCode || topbar.visitCode,
    orderCode: columnFilters.orderCode,
    page,
    pageSize,
    sort,
  }), [tab, topbar, filters, columnFilters, page, pageSize, sort])

  const worklist = useWorklist(worklistFilters, refreshKey)

  const rows = worklist.data?.items ?? []
  const total = worklist.data?.total ?? 0

  // Lọc theo chỉ định / bộ phận chụp chưa có tham số trong `GET /studies` (openapi v0.1),
  // nên tạm lọc trên trang hiện tại và ghi rõ là lọc phía client.
  const visibleRows = useMemo(() => rows.filter(r => {
    if (filters.serviceItemId && String(r.service.id) !== filters.serviceItemId) return false
    if (filters.bodyPart && r.service.bodyPart !== filters.bodyPart) return false
    return true
  }), [rows, filters.serviceItemId, filters.bodyPart])

  const selected = useMemo(
    () => visibleRows.find(r => r.study.id === selectedId)
      ?? rows.find(r => r.study.id === selectedId)
      ?? null,
    [visibleRows, rows, selectedId],
  )

  /* --------------------------------- Các ca khác của cùng bệnh nhân (IN-08) */

  const relatedCode = selected?.patient.patientCode ?? null
  const related = useAsync<WorklistRow[]>(
    async signal => {
      const page = await fetchWorklist({
        ...worklistFilters,
        tab: '',
        statuses: [],
        deviceIds: [],
        modality: '',
        patientClass: '',
        dateFrom: '',
        dateTo: '',
        patientCode: relatedCode!,
        fullName: '',
        visitCode: '',
        orderCode: '',
        page: 1,
        pageSize: 50,
        sort: '',
      }, signal)
      return page.items
    },
    [relatedCode, refreshKey],
    { enabled: relatedCode != null },
  )

  /* ------------------------------ Báo cáo hiện hành của ca đang chọn (panel) */

  const selectedStudyId = selected?.study.id ?? null
  const selectedReport = useAsync(
    signal => fetchCurrentReport(selectedStudyId!, signal),
    [selectedStudyId, refreshKey],
    { enabled: selectedStudyId != null },
  )

  /* ---------------------------------------------------------- Thao tác */

  const patchTopbar = (next: Partial<TopBarState>) => { setTopbar(s => ({ ...s, ...next })); setPage(1) }
  const patchFilters = (next: Partial<SidebarFilters>) => { setFilters(s => ({ ...s, ...next })); setPage(1) }

  const onColumnFilter = (key: keyof ColumnFilters, value: string) => {
    setColumnFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }

  const onSort = (field: string) => {
    setSort(current => {
      const [f, dir] = current.split(',')
      if (f !== field) return `${field},asc`
      return dir === 'asc' ? `${field},desc` : ''
    })
    setPage(1)
  }

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  const resetAll = () => {
    setTopbar(DEFAULT_TOPBAR)
    setFilters(DEFAULT_SIDEBAR_FILTERS)
    setColumnFilters(EMPTY_COLUMN_FILTERS)
    setSort('')
    setPage(1)
  }

  const openGated = (want: 'report.print' | 'clinical.view', target: typeof modal) => {
    if (!can(user, want)) {
      reportForbidden(`Không đủ quyền. ${deniedReason(want)}.`)
      return
    }
    clearForbidden()
    setModal(target)
  }

  /**
   * Mở hộp thoại xác nhận cho một bước chuyển trạng thái. Kiểm quyền ở đây để **không gọi API**
   * khi vai trò không đủ (tiêu chí Task 7); backend vẫn kiểm lại và trả 403.
   */
  const openTransition = (code: string, want: Permission) => {
    if (!can(user, want)) {
      reportForbidden(`Không đủ quyền. ${deniedReason(want)}.`)
      return
    }
    const transition = TRANSITIONS.find(t => t.code === code)
    if (!transition) return
    clearForbidden()
    setPendingTransition(transition)
  }

  const handleExportList = async (all = false) => {
    if (!can(user, 'list.print')) {
      reportForbidden(`Không đủ quyền. ${deniedReason('list.print')}.`)
      return
    }
    clearForbidden()
    setActionError(null)
    setBusyExport(true)
    try {
      const targetFilters = all ? EXPORT_ALL_FILTERS : worklistFilters
      const { blob, filename } = await downloadStudiesCsv(targetFilters)
      saveBlob(blob, filename)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không tải được danh sách.'
      setActionError(msg)
    } finally {
      setBusyExport(false)
    }
  }

  const handlePrintList = async (all = false) => {
    if (!can(user, 'list.print')) {
      reportForbidden(`Không đủ quyền. ${deniedReason('list.print')}.`)
      return
    }
    clearForbidden()
    setActionError(null)
    setBusyExport(true)
    try {
      let targetRows = visibleRows
      if (all) {
        const fullPage = await fetchWorklist(EXPORT_ALL_FILTERS)
        targetRows = fullPage.items
      }
      const uniquePatientIds = Array.from(new Set(targetRows.map(r => r.patient.id)))
      const singlePatientId = uniquePatientIds.length === 1 ? uniquePatientIds[0] : null
      await logListExportEvent({
        target: 'STUDIES',
        mode: 'PRINT',
        rowCount: targetRows.length,
        patientId: singlePatientId,
      })
      printHtml(buildWorklistPrintHtml({
        rows: targetRows,
        tab: all ? 'ALL' : tab,
        printedBy: user.fullName,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không in được danh sách.'
      setActionError(msg)
    } finally {
      setBusyExport(false)
    }
  }

  const apiError = worklist.error ?? counts.error ?? reference.error

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar
        state={topbar}
        onChange={patchTopbar}
        onReset={resetAll}
        onReload={refresh}
        onAddPatient={() => setModal('ADD')}
        onExportAll={() => void handleExportList(true)}
        onPrintAll={() => void handlePrintList(true)}
        user={user}
        onLogout={signOut}
      />

      {(apiError || forbiddenMessage || actionError) && (
        <div
          className={cx(
            'flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[11.5px]',
            forbiddenMessage || apiError?.isForbidden
              ? 'border-[#f6e0b5] bg-[#fdf9ef] text-[#92400e]'
              : 'border-[#f7cfcf] bg-[#fdf2f2] text-[#c81e1e]',
          )}
        >
          <Warning size={13} className="shrink-0" />
          <span className="flex-1">{forbiddenMessage ?? actionError ?? apiError?.message}</span>
          {(forbiddenMessage || actionError) && (
            <button onClick={() => { clearForbidden(); setActionError(null) }} className="font-medium underline">Ẩn</button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          filters={filters}
          onChange={patchFilters}
          departments={reference.data?.departments ?? []}
          devices={reference.data?.devices ?? []}
          serviceItems={reference.data?.serviceItems ?? []}
          counts={counts.data}
          visibleCount={total}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-app p-2 desktop:p-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex min-h-[38px] shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5 desktop:h-[38px] desktop:flex-nowrap desktop:py-0">
              <TabButton active={tab === 'PENDING'} onClick={() => { setTab('PENDING'); setPage(1) }}>Chờ</TabButton>
              <TabButton active={tab === 'DONE'} onClick={() => { setTab('DONE'); setPage(1) }}>Đã thực hiện</TabButton>

              <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <div className="w-[150px]">
                <Select
                  value={topbar.timeField}
                  onChange={e => patchTopbar({ timeField: e.target.value as TimeField })}
                  options={[
                    { value: 'SCHEDULED', label: 'Thời gian thực hiện' },
                    { value: 'ORDERED', label: 'Thời gian chỉ định' },
                    { value: 'COMPLETED', label: 'Thời gian kết thúc' },
                  ]}
                />
              </div>
              <Button
                variant="ghost" icon={<Printer size={12} />}
                disabled={!can(user, 'list.print') || busyExport}
                title={can(user, 'list.print') ? undefined : deniedReason('list.print')}
                onClick={() => void handlePrintList(false)}
              >
                In danh sách
              </Button>
              <Button
                variant="ghost" icon={<Download size={12} />}
                disabled={!can(user, 'list.print') || busyExport}
                title={can(user, 'list.print') ? undefined : deniedReason('list.print')}
                onClick={() => void handleExportList(false)}
              >
                Tải danh sách
              </Button>
              </div>
            </div>

            <WorklistTable
              rows={visibleRows}
              loading={worklist.loading}
              columns={tab === 'PENDING' ? PENDING_COLUMNS : DONE_COLUMNS}
              selectedId={selectedId}
              onSelect={r => setSelectedId(r.study.id)}
              onOpen={r => { setSelectedId(r.study.id); openGated('clinical.view', 'CLINICAL') }}
              visibleOptional={optionalCols}
              onToggleOptional={toggleOptional}
              columnFilterMode={columnFilterMode}
              onToggleColumnFilterMode={() => setColumnFilterMode(v => !v)}
              columnFilters={columnFilters}
              onColumnFilter={onColumnFilter}
              sort={sort}
              onSort={onSort}
            />

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
              onPageSize={n => { setPageSize(n); setPage(1) }}
            />

            <RelatedOrders
              rows={selected ? related.data ?? [] : []}
              selectedId={selectedId}
              onSelect={r => setSelectedId(r.study.id)}
              loading={related.loading}
            />
          </div>
        </main>

        {/* Task 6: panel chỉ dựng khi đã chọn một ca; chưa chọn thì bảng chiếm hết chiều ngang. */}
        {selected && (
          <PatientPanel
            row={selected}
            user={user}
            report={selectedReport.data ?? null}
            onClose={() => setSelectedId(null)}
            onUpdate={() => setModal('UPDATE')}
            onUpdateFromHis={() => setModal('HIS')}
            onAddOrder={() => setModal('ADD')}
            onClinical={() => openGated('clinical.view', 'CLINICAL')}
            onViewImage={() => openStudyViewer(selected.study.id)}
            onReport={() => setModal('REPORT')}
            onPrint={() => openGated('report.print', 'PRINT')}
            onMarkReceived={() => openTransition('T2', 'study.markReceived')}
            onCancelStudy={() => openTransition('T10', 'study.cancel')}
          />
        )}
      </div>

      <AddStudyModal
        open={modal === 'ADD'}
        onClose={() => setModal(null)}
        user={user}
        onCreated={refresh}
      />
      <UpdateStudyModal
        open={modal === 'UPDATE'}
        onClose={() => setModal(null)}
        row={selected}
        user={user}
        onSaved={refresh}
      />
      <UpdateFromHisModal open={modal === 'HIS'} onClose={() => setModal(null)} row={selected} user={user} />
      <ClinicalModal open={modal === 'CLINICAL'} onClose={() => setModal(null)} row={selected} />
      <ReportModal
        open={modal === 'REPORT'}
        onClose={() => setModal(null)}
        row={selected}
        user={user}
        onChanged={refresh}
      />
      <PrintModal open={modal === 'PRINT'} onClose={() => setModal(null)} row={selected} user={user} />
      <StudyTransitionDialog
        open={pendingTransition != null}
        onClose={() => setPendingTransition(null)}
        row={selected}
        transition={pendingTransition}
        onDone={() => {
          // Ca rời tab "Chờ" sau T2/T10 — tải lại cả danh sách lẫn số đếm trạng thái.
          setSelectedId(null)
          refresh()
        }}
      />
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'focus-ring h-7 rounded-md px-3.5 text-[12px] font-semibold transition-colors',
        active ? 'bg-brand-600 text-white' : 'text-ink-3 hover:bg-line-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
