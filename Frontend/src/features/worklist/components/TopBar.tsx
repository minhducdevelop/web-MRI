import { useState } from 'react'
import { ROLE_META, can, deniedReason } from '@/shared/lib/auth'
import type { AppUser, TimeField } from '@/shared/lib/types'
import { Button, IconButton, Input, Popover, Toggle2, cx, usePopover } from '@/shared/ui/controls'
import {
  Check, ChevronDown, Download, Lock, Monitor, Plus, Printer, Refresh, Settings, User, UserPlus, X,
} from '@/shared/ui/Icon'

/**
 * Các nút khoảng thời gian nhanh (Hôm nay / Hôm qua / −3 / −7 / Tất cả) **đã bỏ** theo yêu cầu
 * (Task 4). Việc lọc theo thời gian vẫn còn, nhưng chỉ qua hai ô chọn ngày bên dưới —
 * đúng hợp đồng API: `GET /studies` chỉ nhận `date_from`/`date_to`, không có tham số
 * khoảng thời gian dựng sẵn, nên **không có gì phải gỡ ở backend**.
 */
export interface TopBarState {
  patientCode: string
  patientName: string
  visitCode: string
  dateFrom: string
  dateTo: string
  timeField: TimeField
}

interface Props {
  state: TopBarState
  onChange: (next: Partial<TopBarState>) => void
  onReset: () => void
  onReload: () => void
  onAddPatient: () => void
  onExportAll?: () => void
  onPrintAll?: () => void
  user: AppUser
  onLogout: () => void
}

export function TopBar({
  state, onChange, onReset, onReload, onAddPatient, onExportAll, onPrintAll, user, onLogout,
}: Props) {
  const config = usePopover()
  const account = usePopover()

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2 desktop:h-[52px] desktop:flex-nowrap desktop:py-0">
      {/* Thương hiệu */}
      <div className="flex shrink-0 items-center gap-2 pr-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Plus size={17} strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-tight text-ink">VR-RIS PACS</div>
          <div className="text-[9px] font-medium uppercase tracking-wider text-ink-4">RIS tích hợp PACS</div>
        </div>
      </div>

      {/* Ô tìm kiếm nhanh */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="w-[108px] desktop:w-[118px]">
          <Input
            placeholder="Mã bệnh nhân"
            value={state.patientCode}
            onChange={e => onChange({ patientCode: e.target.value })}
          />
        </div>
        <div className="w-[120px] desktop:w-[132px]">
          <Input
            placeholder="Họ tên bệnh nhân"
            value={state.patientName}
            onChange={e => onChange({ patientName: e.target.value })}
          />
        </div>
        <div className="w-[88px] desktop:w-[96px]">
          <Input
            placeholder="Mã LSVV"
            value={state.visitCode}
            onChange={e => onChange({ visitCode: e.target.value })}
          />
        </div>
      </div>

      {/* Khoảng ngày — `date_from` / `date_to` của GET /studies */}
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="date"
          aria-label="Từ ngày"
          value={state.dateFrom}
          onChange={e => onChange({ dateFrom: e.target.value })}
          className="focus-ring h-7 rounded-md border border-line bg-white px-2 text-[12px] text-ink"
        />
        <span className="text-ink-4">—</span>
        <input
          type="date"
          aria-label="Đến ngày"
          value={state.dateTo}
          onChange={e => onChange({ dateTo: e.target.value })}
          className="focus-ring h-7 rounded-md border border-line bg-white px-2 text-[12px] text-ink"
        />
        <IconButton title="Xóa bộ lọc" onClick={onReset}><X size={14} /></IconButton>
        <IconButton title="Tải lại" onClick={onReload}><Refresh size={14} /></IconButton>
        <IconButton
          title={can(user, 'patient.create') ? 'Thêm bệnh nhân' : deniedReason('patient.create')}
          disabled={!can(user, 'patient.create')}
          onClick={onAddPatient}
          className={!can(user, 'patient.create') ? 'cursor-not-allowed opacity-40' : undefined}
        >
          <UserPlus size={14} />
        </IconButton>
        <div className="relative">
          <IconButton
            title={can(user, 'config.system') ? 'Cấu hình hệ thống' : deniedReason('config.system')}
            disabled={!can(user, 'config.system')}
            onClick={config.toggle}
            className={cx(
              config.open && 'border-brand-300 bg-brand-50 text-brand-600',
              !can(user, 'config.system') && 'cursor-not-allowed opacity-40',
            )}
          >
            <Settings size={14} />
          </IconButton>
          <SystemConfigMenu
            open={config.open}
            onClose={config.close}
            onAddPatient={onAddPatient}
            onExportAll={onExportAll}
            onPrintAll={onPrintAll}
            user={user}
          />
        </div>
      </div>

      <div className="relative ml-auto">
        <button
          onClick={account.toggle}
          className="focus-ring flex h-7 items-center gap-1.5 rounded-md border border-line px-1.5 pr-2 transition-colors hover:bg-line-soft"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
            {user.fullName.slice(0, 1)}
          </span>
          <span className="max-w-[130px] truncate text-[12px] font-medium text-ink-2">{user.username}</span>
          <ChevronDown size={12} className="text-ink-4" />
        </button>

        <Popover open={account.open} onClose={account.close} className="w-[216px] p-2.5">
          <div className="mb-2 flex items-center gap-2 border-b border-line pb-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[12px] font-bold text-white">
              {user.fullName.slice(0, 1)}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[12px] font-semibold text-ink">{user.fullName}</span>
              <span className="block truncate text-[10.5px] text-ink-4">{user.email || user.username}</span>
            </span>
          </div>

          <div className="mb-2 section-label">Vai trò</div>
          <div className="mb-2.5 space-y-1">
            {user.roles.map(r => (
              <div key={r} className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
                <User size={11} className="text-brand-500" />
                {ROLE_META[r].label}
              </div>
            ))}
          </div>

          <Button variant="ghost" block icon={<Lock size={12} />} onClick={onLogout}>Đăng xuất</Button>
        </Popover>
      </div>
    </header>
  )
}

/* ------------------------------------------------ Popover Cấu hình hệ thống */

const CONFIG_ROWS: { label: string; options: [string, string]; initial: string }[] = [
  { label: 'Loại màn', options: ['Ngang', 'Dọc'], initial: 'Ngang' },
  { label: 'Màn hình', options: ['Một', 'Nhiều'], initial: 'Một' },
  { label: 'Double Click', options: ['Viewer', 'Chi tiết'], initial: 'Viewer' },
  { label: 'Tổng hợp', options: ['Đơn', 'Gộp'], initial: 'Đơn' },
  { label: 'Giải mã tải về', options: ['Không', 'Có'], initial: 'Không' },
  { label: 'Ẩn bộ lọc', options: ['Không', 'Có'], initial: 'Không' },
  { label: 'Ẩn ĐS máy', options: ['Không', 'Có'], initial: 'Không' },
  { label: 'Giao diện xổ', options: ['Tắt', 'Bật'], initial: 'Tắt' },
]

function SystemConfigMenu({ open, onClose, onAddPatient, onExportAll, onPrintAll, user }: {
  open: boolean
  onClose: () => void
  onAddPatient: () => void
  onExportAll?: () => void
  onPrintAll?: () => void
  user: AppUser
}) {
  return (
    <Popover open={open} onClose={onClose} className="w-[300px] p-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-brand-700">
        <Settings size={13} />
        Cấu hình hệ thống
      </div>

      <div className="space-y-1">
        {CONFIG_ROWS.map(row => <ConfigRow key={row.label} {...row} />)}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-line pt-3">
        <Button
          variant="outline" block icon={<Printer size={13} />}
          disabled={!can(user, 'list.print')}
          title={can(user, 'list.print') ? undefined : deniedReason('list.print')}
          onClick={() => { onPrintAll?.(); onClose() }}
        >
          In toàn bộ danh sách
        </Button>
        {/*
          Luôn khóa: duyệt hàng loạt là chức năng phụ H-05 [HOÃN] (doc/01-scope.md mục 4), chưa có
          endpoint nào. Thêm nữa popover này chỉ mở được bằng `config.system` (chỉ ADMIN), mà ADMIN
          không có `report.approve` sau khi đồng bộ T30 (D15: ADMIN không đọc, không duyệt) — nên
          nút này không vai trò nào bấm được. Ghi rõ lý do thay vì để tooltip "cần vai trò BS duyệt"
          gây hiểu nhầm là chỉ thiếu quyền.
        */}
        <Button
          variant="outline" block icon={<Check size={13} />}
          disabled
          title="Duyệt hàng loạt là chức năng phụ H-05, còn [HOÃN] — chưa có endpoint"
        >
          Duyệt toàn bộ danh sách
        </Button>
        <Button
          variant="outline" block icon={<UserPlus size={13} />}
          disabled={!can(user, 'patient.create')}
          title={can(user, 'patient.create') ? undefined : deniedReason('patient.create')}
          onClick={() => { onAddPatient(); onClose() }}
        >
          Thêm bệnh nhân
        </Button>
        <Button
          variant="outline" block icon={<Download size={13} />}
          disabled={!can(user, 'list.print')}
          title={can(user, 'list.print') ? undefined : deniedReason('list.print')}
          onClick={() => { onExportAll?.(); onClose() }}
        >
          Tải toàn bộ danh sách
        </Button>
        <Button variant="outline" block icon={<Monitor size={13} />}>Chọn Modality</Button>
      </div>
    </Popover>
  )
}

function ConfigRow({ label, options, initial }: { label: string; options: [string, string]; initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[12px] text-ink-3">{label}</span>
      <Toggle2 value={value} options={options} onChange={setValue} />
    </div>
  )
}
