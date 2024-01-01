import { MullionDesignDto } from './mullion-design.model';
import { SingleDesignDto } from './single-deisng.model';

export interface IDesignDto {
  quatation_id: string;
  quatation_product_id: string;
  quantity: string;
  height: number;
  width: number;
  is_saved: false;
  mullions: MullionDesignDto[];
  parts: SingleDesignDto[];
  image: string;
}
