// Thanh thong bao noi (toast) goc tren-phai VIEWPORT - bac si biet NGAY "thao tac vua bam da lam
// duoc gi" (gui nhap sang RIS, RIS xac nhan/tu choi, ghi audit...) ma khong can tu doc lai console.
// Vanilla DOM, KHONG dung React/hook - cung nguyen tac voi aiPanelCore.js (tranh loi "Invalid hook
// call" giua ban React cua OHIF va ban React ma extension nay tu dong goi rieng).
const STACK_ID = 'vr-ris-ai-panel-toast-stack';
const DURATION_MS = 3500;

function getStack() {
  let stack = document.getElementById(STACK_ID);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = STACK_ID;
    stack.className = 'ai-toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

/** kind: 'success' | 'warning'. Tu an sau DURATION_MS; bam vao thi an som. */
export function showAiToast(kind, message) {
  const stack = getStack();
  const el = document.createElement('div');
  el.className = 'ai-toast ai-toast--' + kind;
  el.textContent = message;
  el.addEventListener('click', () => el.remove());
  stack.appendChild(el);
  setTimeout(() => el.remove(), DURATION_MS);
  return el;
}
