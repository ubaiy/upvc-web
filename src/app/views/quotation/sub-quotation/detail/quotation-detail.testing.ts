/**
 * A `quatation/show` response for the specs of the quotation page: the
 * figures of quotation Q-0003 on the demo (Retail 20%, CGST + SGST).
 */
export function sampleQuotation(overrides: any = {}): any {
  return {
    id: 14,
    quatation_identity: '6ac2034603094',
    quatation_name: 'Al-Rashid Villa Windows',
    number: 'Q-0003',
    status: 'draft',
    is_convert_bill: 0,
    grand_total: 25039.21,
    customer_id: 2,
    customer: { id: 2, name: 'Ahmed Al-Rashid', phone: '9812345670', email: 'ahmed@example.com' },
    customer_address: JSON.stringify({ address: 'Villa 14, Palm Street', city: 'Godhra', state: 'Gujarat', zip_code: '389001' }),
    valid_until: '2026-11-03',
    sent_at: null,
    accepted_at: null,
    declined_at: null,
    order_type_margin_id: 1,
    payment_term_id: 1,
    discount_type: null,
    discount_value: 0,
    prices_include_gst: false,
    revision_no: 0,
    superseded_by_id: null,
    bill: null,
    revisions: [],
    quatation_product: [
      {
        id: 19,
        width: '1800',
        height: '1200',
        total: 7376.55,
        quantity: 1,
        product_type: 'Window',
        label: 'Master bedroom',
        image: 'data:image/png;base64,AAAA',
        product: { category: 'Casement' },
        costhead_information: {
          costhead: [{ name: '5mm plain glass', type: 'Glazzing' }],
          old_post_data: {
            full_window: {
              parts: [
                { width: 900, category_type: 'Casement', casement_type: 'Openable', opening_direction: 'Left' },
                { width: 900, category_type: 'Casement', casement_type: 'Fixed', opening_direction: 'Left' },
              ],
            },
          },
        },
      },
      {
        id: 20,
        width: '1200',
        height: '1500',
        total: 7263.29,
        quantity: 2,
        product_type: 'Window',
        label: null,
        image: null,
        product: { category: 'Sliding' },
        costhead_information: { costhead: [], old_post_data: null },
      },
    ],
    totals: {
      item_count: 2,
      total_area_sq_ft: 42.63,
      margin: { id: 1, name: 'Retail', percent: 20 },
      payment_term: { id: 1, name: '50% Advance, 50% on Delivery' },
      prices_include_gst: false,
      items: [
        { id: 19, label: 'Master bedroom', quantity: 1, amount: 8851.86, rate_per_sq_ft: 380.72 },
        { id: 20, label: null, quantity: 2, amount: 8715.95, rate_per_sq_ft: 449.86 },
      ],
      subtotal: 17567.81,
      discount: { type: null, value: 0, amount: 0 },
      taxable_value: 17567.81,
      tax: {
        applicable: true,
        mode: 'intra_state',
        lines: [
          { code: 'CGST', rate: 9, label: 'CGST 9%', amount: 1581.1 },
          { code: 'SGST', rate: 9, label: 'SGST 9%', amount: 1581.1 },
        ],
        place_of_supply_assumed: false,
        note: null,
      },
      round_off: -0.01,
      total: 20730,
      advance: { percent: 50, amount: 10365 },
    },
    ...overrides,
  };
}
