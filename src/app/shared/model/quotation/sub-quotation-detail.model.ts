import { IMasterDetailDto } from '../masters/masterDetail.model';
import { IProductDetailDto } from '../profile/productDetail.model';
import { ICustomerAdddressDto } from '../customer/customerAddress.model';
export interface ISubQuotationDetailDto {
  id: number;
  height: string;
  width: string;
  total: number;
  product_type: string;
  product_information: IProductDetailDto[];
  costhead_information: IMasterDetailDto;
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
    created_at: string;
    updated_at: string;
    sub_category: string;
    is_2track: boolean;
    is_mono: boolean;
    is_3track: boolean;
    origin_name: string;
  };
  quatation: {
    id: number;
    quatation_identity: string;
    area_name: string;
    customer_address: ICustomerAdddressDto;
    customer_id: number;
    area_id: number;
    customer: {
      id: number;
      identity: string;
      name: string;
      is_dealer: number;
      phone: string;
      email: string;
    };
  };
  customer: {
    id: number;
    identity: string;
    name: string;
    is_dealer: number;
    phone: string;
    email: string;
  };
  old_post_data: {
    quatation_id: string;
    quantity: string;
    mullion_quantity: number;
    casement_type: string;
    quatation_product_id: string;
    palla_type: string;
    hinges_type: string;
    is_track: string;
    product_type: string;
    handle_id: number;
    is_cupler: boolean;
    is_louvers: boolean;
    is_lshape: boolean;
    product_id: number;
    sash_id: number;
    mullion_id: number;
    height: number;
    width: number;
    total: number;
    is_saved: boolean;
    glazz_id: string;
    flymesh_id: number;
    ventilation_id: number;
    costhead_information: [];
    product_information: [
      {
        product_id: number;
        quantity: number;
      }
    ];
  };
}
