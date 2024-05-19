export interface IDesignObjectDto {
  frameWidth: number;
  frameHeight: number;
  profile_color: string;
  designId: string;
  palla: IPallaDto[];
}

export interface IPallaDto {
  height: number;
  width: number;
  frameWidth: number;
  frameHeight: number;
  direction: string;
}

export class DesignObjectDto implements IDesignObjectDto {
  frameWidth: number;
  frameHeight: number;
  profile_color: string;
  designId: string;
  palla: IPallaDto[];
}
