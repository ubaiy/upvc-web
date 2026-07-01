export interface IProfileDropdown {
  id: string;
  profile_name: string;
  profile_code: string;
  // Phase 1 — geometry fields returned by the profile dropdown endpoint
  face_width_mm?: number;  // visible face width (drives drawing + deductions)
  role?: string;           // frame|sash|shutter|mullion|transom|bead|interlock|coupler
}
