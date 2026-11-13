import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api/http'
import { can, deniedReason } from '@/shared/lib/auth'
import { formatDateTime, formatDob } from '@/shared/lib/format'
import type { AppUser, ImagingOrder, Patient, WorklistRow } from '@/shared/lib/types'
import { Button, Input, Modal, Radio, cx } from '@/shared/ui/controls'
import { Search, Sync, Warning } from '@/shared/ui/Icon'
import { searchImagingOrders, searchPatients } from '../api/studiesApi'

type Mode = 'ORDER' | 'PATIENT'

/**
 * "Cập nhật chỉ định từ HIS" — tra cứu theo mã chỉ định hoặc mã bệnh nhân.
 *
 * ⚠️ Giới hạn đã biết: **chưa có endpoint đồng bộ HIS**. `doc/06-rbac-matrix.md` mục 6 ghi
 * `order.sync` là "chưa có endpoint tương ứng trong OpenAPI ❓", và Mock HIS theo HL7 v2 vẫn là
 * `H-03` [HOÃN] (`doc/01-scope.md` mục 4). Vì vậy phần **tra cứu** gọi API thật
 * (`GET /imaging-orders`, `GET /patients`) còn nút "Cập nhật" bị khóa kèm lý do, thay vì giả vờ
 * đồng bộ rồi không làm gì.
 */
export function UpdateFromHisModal({ open, onClose, row, user }: {
  open: boolean
  onClose: () => void
  row: WorklistRow | null
  user: AppUser
}) {
  const allowed = can(user, 'order.sync')

  const [mode, setMode] = useState<Mode>('ORDER')
  const [term, setTerm] = useState('')
  const [orders, setOrders] = useState<ImagingOrder[] | null>(null)
  const [patients, setPatients] = useState<Patient[] | null>(null)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMode('ORDER')
    setTerm(row?.order.orderCode ?? '')
    setOrders(null)
    setPatients(null)
    setPickedId(null)
    setError(null)
    setBusy(false)
  }, [open, row?.order.orderCode])

  useEffect(() => {
    if (!open) return
    setTerm(mode === 'ORDER' ? row?.order.orderCode ?? '' : row?.patient.patientCode ?? '')
    setOrders(null)
    setPatients(null)
    setPickedId(null)
  }, [mode, open, row?.order.orderCode, row?.patient.patientCode])

  if (!open) return null

  const runSearch = async () => {
    setBusy(true)
    setError(null)
    setPickedId(null)
    try {
      if (mode === 'ORDER') {
        const page = await searchImagingOrders({ orderCode: term.trim() || undefined })
        setOrders(page.items)
        setPatients(null)
      } else {
        const page = await searchPatients({ patientCode: term.trim() || undefined })
        setPatients(page.items)
        setOrders(null)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không gọi được máy chủ, thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const results = mode === 'ORDER' ? orders : patients
  const syncDisabled = !allowed
    ? deniedReason('order.sync')
    : 'Chưa có endpoint đồng bộ HIS — Mock HIS (HL7 v2) còn [HOÃN] ở H-03'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cập nhật chỉ định từ HIS"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          <Button icon={<Sync size={12} />} disabled title={syncDisabled}>Cập nhật</Button>
        </>
      }
    >
      <div className="mb-3 flex items-start gap-1.5 rounded-md border border-[#f6e0b5] bg-[#fdf9ef] px-2.5 py-2 text-[11.5px] text-[#92400e]">
        <Warning size={13} className="mt-px shrink-0" />
        <span>
          Tra cứu dưới đây gọi API thật của RIS. Việc <strong>kéo dữ liệu từ HIS</strong> chưa làm được:
          chưa có endpoint tương ứng trong <code className="font-mono">openapi.yaml</code>, Mock HIS theo
          HL7 v2 vẫn là <strong>H-03 [HOÃN]</strong>.
        </span>
      </div>

      <div className="mb-2.5 flex items-center gap-5">
        <Radio checked={mode === 'ORDER'} onChange={() => setMode('ORDER')} label="Mã chỉ định" />
        <Radio checked={mode === 'PATIENT'} onChange={() => setMode('PATIENT')} label="Mã bệnh nhân" />
      </div>

      <div className="mb-3 flex gap-2">
        <Input
          withSearchIcon
          value={term}
          onChange={e => setTerm(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void runSearch() }}
          placeholder={mode === 'ORDER' ? 'Nhập mã chỉ định' : 'Nhập mã bệnh nhân'}
        />
        <Button
          icon={<Search size={12} />}
          className="shrink-0 px-3"
          disabled={busy}
          onClick={() => void runSearch()}
        >
          {busy ? 'Đang tìm…' : 'Tìm kiếm'}
        </Button>
      </div>

      <div className="mb-1.5 section-label">
        {mode === 'ORDER' ? 'Danh sách chỉ định' : 'Danh sách bệnh nhân'}
      </div>

      {results == null && (
        <p className="text-[11.5px] text-ink-4">Nhập mã rồi bấm "Tìm kiếm" để tra cứu.</p>
      )}
      {results?.length === 0 && (
        <p className="text-[11.5px] text-ink-4">Không tìm thấy kết quả nào khớp mã đã nhập.</p>
      )}

      <div className="space-y-1.5">
        {orders?.map(o => (
          <ResultRow
            key={o.id}
            picked={pickedId === o.id}
            onPick={() => setPickedId(o.id)}
            title={o.orderCode}
            subtitle={`Bác sĩ chỉ định ${o.orderingDoctorName} · Ngày chỉ định ${formatDateTime(o.orderedAt)}`}
          />
        ))}
        {patients?.map(p => (
          <ResultRow
            key={p.id}
            picked={pickedId === p.id}
            onPick={() => setPickedId(p.id)}
            title={p.fullName}
            subtitle={`${p.patientCode} · ${formatDob(p.dateOfBirth, p.dobPrecision)}`}
          />
        ))}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-1.5 rounded-md border border-[#f7cfcf] bg-[#fdf2f2] px-2.5 py-2 text-[11.5px] text-[#c81e1e]">
          <Warning size={13} className="mt-px shrink-0" />
          {error}
        </div>
      )}
    </Modal>
  )
}

function ResultRow({ picked, onPick, title, subtitle }: {
  picked: boolean
  onPick: () => void
  title: string
  subtitle: string
}) {
  return (
    <label
      onClick={onPick}
      className={cx(
        'flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
        picked ? 'border-brand-200 bg-brand-50' : 'border-line bg-white hover:bg-line-soft',
      )}
    >
      <span className="pt-0.5">
        <Radio checked={picked} onChange={onPick} label="" />
      </span>
      <span className="min-w-0 leading-snug">
        <span className="block truncate text-[12px] font-medium text-brand-700">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-4">{subtitle}</span>
      </span>
    </label>
  )
}
