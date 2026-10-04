export interface IDashboardModelDto {
  total_customer: number;
  total_quatation: number;
  total_quatation_product: number;
  total_revenue_quatation: number;
  total_revenue_quatation_current_month: number;
  total_revenue_quatation_converted_to_bill: number;
  total_revenue_quatation_converted_to_bill_current_month: number;
  /** Quotations and bills made this month (api card T68). Absent on an older api. */
  quatation_count_current_month?: number | string | null;
  bill_count_current_month?: number | string | null;
}
