export interface IProductDetailDto {
  id: number;
  category: string;
  profile_code: string;
  profile_name: string;
  kg_meter: number;
  rate_meter: number;
  rate_bar: number;
  totalCost: number;
  quantity: number;
  // Phase 1 — profile geometry (all optional; nullable in backend)
  role?: string;             // frame|sash|shutter|mullion|transom|bead|interlock|coupler
  face_width_mm?: number;    // visible face width — drives drawing thickness & deductions
  profile_depth_mm?: number; // front-to-back depth
  rebate_mm?: number;        // glazing rebate height
  sightline_mm?: number;     // optional, for daylight calc
}
