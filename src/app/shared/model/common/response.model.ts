export interface IResponseDto<T> {
  message: string;
  success: boolean;
  data: T;
}
