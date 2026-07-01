export interface IProductListDto {
  id: number;
  category: string;
  profile_code: string;
  profile_name: string;
  kg_meter: number;
  rate_meter: number;
  rate_bar: number;
  kg_meter_color: number;
  rate_meter_color: number;
  rate_bar_color: number;
  // Phase 1 — profile geometry (all optional; nullable in backend)
  role?: string;
  face_width_mm?: number;
  profile_depth_mm?: number;
  rebate_mm?: number;
  sightline_mm?: number;
}
