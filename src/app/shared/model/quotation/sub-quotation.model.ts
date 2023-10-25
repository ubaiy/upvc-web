import { ICustomerDto } from '../customer/customer.model';
import { ICustomerAdddressDto } from '../customer/customerAddress.model';
import { IProductDetailDto } from '../profile/productDetail.model';
import { IMasterDetailDto } from '../masters/masterDetail.model';
export interface ISubQuotation {
  id: number;
  quatation_identity: string;
  area_name: string;
  customer_address: ICustomerAdddressDto;
  grand_total: number;
  customer_id: number;
  area_id: number;
  customer: ICustomerDto;
  average_total: number;
  quatation_product: [
    {
      id: number;
      selected: boolean;
      height: string;
      width: string;
      total: number;
      total_area: number;
      product_type: string;
      product_information: IProductDetailDto;
      costhead_information: IMasterDetailDto[];
      product_id: number;
      quatation_id: number;
      product: {
        id: number;
        category: string;
        profile_code: string;
        profile_name: string;
        kg_meter: number;
        rate_meter: number;
        rate_bar: number;
        sub_category: string;
        is_2track: boolean;
        is_mono: boolean;
        is_3track: boolean;
        origin_name: string;
      };
    }
  ];
}
