// =============================================================================
//  CSV export for accounting (Phase 10 item 6)
//
//  Excel on Windows opens a UTF-8 CSV as mojibake unless the file starts with a
//  BOM and uses CRLF line endings, and Persian figures only survive if we never
//  let the spreadsheet guess. Hence: BOM + CRLF + Latin digits.
// =============================================================================

const BOM = '\ufeff';
const CRLF = '\r\n';

export const ORDER_CSV_COLUMNS = [
  { key: 'orderNumber', title: 'شماره سفارش' },
  { key: 'createdAt', title: 'تاریخ ثبت', format: (v) => formatDateTime(v) },
  { key: 'userFullName', title: 'مشتری' },
  { key: 'phone', title: 'موبایل', format: (_v, row) => row.shippingAddress?.phone || row.userPhone || '' },
  { key: 'province', title: 'استان', format: (_v, row) => row.shippingAddress?.province || '' },
  { key: 'city', title: 'شهر', format: (_v, row) => row.shippingAddress?.city || '' },
  { key: 'orderType', title: 'نوع سفارش', format: (v) => (v === 'WHOLESALE' ? 'عمده‌فروشی' : 'خرده‌فروشی') },
  { key: 'itemsCount', title: 'تعداد اقلام', format: (_v, row) => (row.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0) },
  { key: 'totalAmount', title: 'جمع کالا (تومان)' },
  { key: 'discountAmount', title: 'تخفیف (تومان)', format: (v) => Number(v) || 0 },
  { key: 'couponCode', title: 'کد تخفیف' },
  { key: 'shippingFee', title: 'هزینه ارسال (تومان)', format: (v) => Number(v) || 0 },
  { key: 'payableAmount', title: 'مبلغ نهایی (تومان)' },
  { key: 'status', title: 'وضعیت سفارش', format: (v) => translateStatus(v) },
  { key: 'paymentStatus', title: 'وضعیت پرداخت', format: (v) => translatePayment(v) },
  { key: 'paymentRefId', title: 'کد پیگیری پرداخت' },
  { key: 'trackingCode', title: 'کد رهگیری مرسوله' }
];

const STATUS_FA = {
  PENDING: 'در انتظار تأیید',
  CONFIRMED: 'تأیید شده',
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال شده',
  DELIVERED: 'تحویل شده',
  CANCELLED: 'لغو شده'
};

const PAYMENT_FA = {
  PENDING: 'پرداخت‌نشده',
  PAID: 'پرداخت شده',
  FAILED: 'ناموفق',
  REFUNDED: 'بازگشت داده شده'
};

function translateStatus(value) {
  return STATUS_FA[value] || value || '';
}

function translatePayment(value) {
  return PAYMENT_FA[value] || value || 'پرداخت‌نشده';
}

/** Tehran wall-clock time, without pulling in a date library. */
export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(new Date(value).getTime() + (3 * 60 + 30) * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** RFC 4180 escaping: quote anything containing a separator, quote or newline. */
export function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildOrdersCsv(orders = []) {
  const header = ORDER_CSV_COLUMNS.map(c => csvCell(c.title)).join(',');

  const rows = orders.map(order =>
    ORDER_CSV_COLUMNS
      .map(column => {
        const raw = column.format ? column.format(order[column.key], order) : order[column.key];
        return csvCell(raw);
      })
      .join(',')
  );

  return BOM + [header, ...rows].join(CRLF) + CRLF;
}
