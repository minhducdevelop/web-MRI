import React from 'react';
import { renderAiPanel, bindAiPanel } from './aiPanelCore';
import { injectAiPanelStylesOnce } from './aiPanelStyles';
import { MockAiPanelDataSource } from './aiPanelDataSource';
import { draftToFields, sendDraftApply, sendDraftDismiss, listenForAck } from './risBridge';
import { showAiToast } from './aiPanelToast';

// AI Panel that cho OHIF (tab thu 3 "AI" o cot phai, canh Segmentation/Measurements) - port tu
// ai-panel.html (goc repo), xem khoi comment dau file do de biet nguon Figma + spec day du
// (doc/11-ai-design.md muc 4-7). Markup/CSS/event la DOM thuan (aiPanelCore.js, aiPanelStyles.js),
// KHONG dung hook React - tranh loi "Invalid hook call" giua ban React cua OHIF va ban React ma
// chinh extension nay tu dong goi rieng (da gap va sua o ban demo truoc, xem doc/07-pacs-dicom.md
// muc 6.4). Component React duoi day CHI la lop vo mong de OHIF mount/unmount dung cho; toan bo UI
// that render qua renderAiPanel()/bindAiPanel() vao 1 div thuan.

function getStudyInstanceUidFromUrl() {
  // URL dang "/viewer/<uid>" (xac nhan 2026-11-09, xem doc/07-pacs-dicom.md muc 6.1) - uid la segment
  // ngay sau "/viewer/".
  const m = window.location.pathname.match(/\/viewer\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// STUB: RIS chua co endpoint ghi audit cho cac hanh dong AI (doc/11-ai-design.md muc 6 - 7 gia tri
// audit_log.action moi cho AI la DE XUAT, chua co trong DB/migration that). Khong tu them endpoint/
// migration o day - chi log ro de nhom thay duoc moi lan su kien nay xay ra.
function onAuditEvent(name, payload) {
  // eslint-disable-next-line no-console
  console.info('[ai-panel][audit-stub] ' + name, payload);
}

// Cau toast chung cho "audit stub" o tren - KHONG de bac si tuong nham la da ghi audit_log thuc su
// (phan biet voi "da gui sang RIS", viec nay THAT lam duoc qua window.opener postMessage).
const AUDIT_STUB_NOTE = 'Audit log: CHƯA có endpoint ghi audit cho hành động AI ở RIS (doc/11-ai-design.md mục 6.2) — hành động chỉ mới log ở console, chưa vào audit_log.';

class AiPanelHost extends React.Component {
  constructor(props) {
    super(props);
    this.containerRef = null;
    this.dataSource = new MockAiPanelDataSource();
    this.studyInstanceUID = getStudyInstanceUidFromUrl();
    this.setRef = (el) => {
      this.containerRef = el;
    };
  }

  componentDidMount() {
    injectAiPanelStylesOnce(document);
    this.load();
    this.unlistenAck = listenForAck((ack) => {
      if (ack.ok) {
        // eslint-disable-next-line no-console
        console.info('[ai-panel] RIS da dien gop y vao form bao cao', { studyInstanceUID: ack.studyInstanceUID });
        showAiToast('success', 'RIS đã nhận và điền gợi ý vào form báo cáo.');
      } else {
        // eslint-disable-next-line no-console
        console.warn('[ai-panel] RIS tu choi gop y AI', { studyInstanceUID: ack.studyInstanceUID, reason: ack.reason });
        showAiToast('warning', 'RIS đã TỪ CHỐI gợi ý AI' + (ack.reason ? `: ${ack.reason}` : '.'));
      }
    });
  }

  componentWillUnmount() {
    if (this.unlistenAck) this.unlistenAck();
  }

  load() {
    this.dataSource.getState(this.studyInstanceUID).then((state) => {
      if (!this.containerRef) return;
      // doc/11-ai-design.md muc 5.2.6: mo ca voi READY -> panel o dang thu gon, chua tu bung.
      if (state.status === 'READY') state.collapsed = true;
      renderAiPanel(this.containerRef, state);
      bindAiPanel(this.containerRef, (name, detail) => this.handleEvent(name, detail));
    });
  }

  handleEvent(name, detail) {
    switch (name) {
      case 'accept':
      case 'edit': {
        // "Dung goi y nay" / "Sua truoc khi dung" -> chep draft vao form bao cao chinh (ReportModal)
        // qua postMessage AI_DRAFT_APPLY, CHUA luu (luu luon o form chinh de server tinh
        // report.origin - quy tac cung, khong tu them nut Luu o day). Can RIS mo OHIF bang
        // window.open KHONG "noopener" moi co window.opener de gui nguoc - xem risBridge.js va
        // bao cao cuoi cua task noi kenh nay.
        const fields = draftToFields(detail && detail.draft);
        const mode = name === 'accept' ? 'use' : 'edit';
        const sent = sendDraftApply(mode, this.studyInstanceUID, fields);
        const label = name === 'accept' ? 'Dùng gợi ý này' : 'Sửa trước khi dùng';
        if (!sent) {
          // eslint-disable-next-line no-console
          console.warn('[ai-panel] Khong gui duoc AI_DRAFT_APPLY (thieu RIS_ORIGIN, window.opener, hoac studyInstanceUID).');
          showAiToast('warning', `KHÔNG gửi được nội dung nháp sang RIS ("${label}") — thiếu kết nối tới tab RIS. ${AUDIT_STUB_NOTE}`);
        } else {
          showAiToast('success', `Đã gửi nội dung nháp sang RIS ("${label}") — đang chờ bác sĩ lưu ở form báo cáo.\n${AUDIT_STUB_NOTE}`);
        }
        // Khong ghi noi dung nhap day du vao audit (doc/11-ai-design.md muc 6.2) - chi khoa + so luong.
        onAuditEvent(name, { studyInstanceUID: this.studyInstanceUID, fieldKeys: Object.keys(fields), sent });
        break;
      }
      case 'dismiss': {
        const sentDismiss = sendDraftDismiss(this.studyInstanceUID);
        showAiToast(
          sentDismiss ? 'success' : 'warning',
          (sentDismiss ? 'Đã báo RIS: bỏ qua gợi ý AI.' : 'KHÔNG báo được cho RIS — thiếu kết nối tới tab RIS.') +
            `\n${AUDIT_STUB_NOTE}`,
        );
        onAuditEvent(name, detail);
        break;
      }
      case 'refresh':
        this.load();
        break;
      case 'suggestion-viewed':
        showAiToast('warning', `Đã mở "Nhãn AI đề xuất".\n${AUDIT_STUB_NOTE}`);
        onAuditEvent(name, detail);
        break;
      default:
        // toggle-collapse, overlay-toggle, opacity-change — tuy chinh hien thi, khong phai hanh
        // dong can bao audit/toast cho bac si.
        onAuditEvent(name, detail);
        break;
    }
  }

  render() {
    return React.createElement('div', { className: 'ai-panel-root', ref: this.setRef });
  }
}

function getPanelModule() {
  return {
    // "defaultContext" la BAT BUOC trong ban OHIF nay - thieu field nay lam crash CA toolbar chinh,
    // khong chi panel moi (phat hien va ghi lai o doc/07-pacs-dicom.md muc 6.4).
    defaultContext: ['VIEWER'],
    menuOptions: [
      {
        icon: 'list',
        label: 'AI',
        target: 'vr-ris-ai-panel',
      },
    ],
    components: [
      {
        id: 'vr-ris-ai-panel',
        component: AiPanelHost,
      },
    ],
  };
}

function preRegistration() {
  // eslint-disable-next-line no-console
  console.log('[vr-ris-ai-panel] extension da nap thanh cong');
}

window.VrRisAiPanelExtension = {
  id: 'vr-ris-ai-panel',
  preRegistration,
  getPanelModule,
};
