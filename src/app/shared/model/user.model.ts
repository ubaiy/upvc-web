export interface IUserDto {
  id: number;
  name: string;
  email: string;
  phone: string;
  access_token: string;
}

export class UserDto implements IUserDto {
  id: number;
  name: string;
  email: string;
  phone: string;
  access_token: string;
}
