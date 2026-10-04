export interface ITypeMarginDto {
  id: number;
  name: string;
  /** A free-text note of the old screen. Optional at the api, which keeps what is stored when it is not sent. */
  pricing?: string;
  mark_up: string;
}
