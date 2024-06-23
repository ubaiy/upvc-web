import { ICustomerAdddressDto } from '../customer/customerAddress.model';

export interface IQuotationDetailDto {
  quatation_identity: string;
  area_name: string;
  area_id: number;
  customer_id: number;
  customer_address: ICustomerAdddressDto;
  id: number;
  quatation_name: string;
}
