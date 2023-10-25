import { ICustomerAdddressDto } from '../customer/customerAddress.model';

export interface IQuotationDto {
  id: number;
  quatation_identity: string;
  area_name: string;
  customer_address: string;
  grand_total: number;
  customer_id: number;
  name: string;
  phone: string;
  email: string;
}
