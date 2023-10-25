import { IOpenDirectionDrpDto } from '../quotation/open-directionDrp.model';
import { IProfileColorDto } from '../profile/profile-color.model';
export interface IAllDropDownsDto {
  product_type: string[];
  slidding_type: string[];
  casement_type: string[];
  palla_type: number[];
  opening_direction: IOpenDirectionDrpDto[];
  hinges_type: string[];
  costhead_unit_type: string[];
  profile_color: IProfileColorDto[];
}
