/* Shared by the Fleets screens (user, 2026-09-29). */
export const STATUS = {
  draft:     ['Draft', 'info', 'Created, no quotation sent yet.'],
  quoted:    ['Quoted', 'watch', 'Quotation and payment link emailed; waiting for payment.'],
  paid:      ['Paid — approve', 'good', 'Paid. Review the fleet and press Approve to switch it on.'],
  active:    ['Active', 'good', 'Monitored: checked daily, Excel emailed every evening.'],
  paused:    ['Paused', 'info', 'Paused by you: no checks, no emails.'],
  expired:   ['Expired', 'wrong', 'Period ended without a paid renewal: no checks, no emails.'],
  cancelled: ['Cancelled', 'info', 'Cancelled.'],
};

/* The steps a fleet goes through, for the progress line on its page. */
export const STEPS = [['draft', 'Created'], ['quoted', 'Quotation sent'], ['paid', 'Paid'], ['active', 'Approved & active']];
export const stepIndex = (s) => ({ draft: 0, quoted: 1, paid: 2, active: 3, paused: 3, expired: 3, cancelled: -1 }[s] ?? 0);

export const DOC_TONE = { valid: 'good', due: 'watch', expired: 'wrong', na: 'info', missing: 'info' };
export const VEH_STATE = { ok: ['All good', 'good'], attention: ['Needs attention', 'watch'], expired: ['Action now', 'wrong'], unchecked: ['Not checked yet', 'info'] };

export const daysLeft = (end) => (end ? Math.ceil((new Date(end) - Date.now()) / 86400000) : null);
