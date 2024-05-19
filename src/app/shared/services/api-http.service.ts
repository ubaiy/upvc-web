import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiHttpService {
  public readonly REST_API_SERVER: string = environment.API_URL;

  constructor(private http: HttpClient) {}

  public get = (url: string, options?: any): Observable<any> =>
    this.http.get(`${this.REST_API_SERVER}/${url}`, options);

  public post = (url: string, data?: any, options?: any): Observable<any> =>
    this.http.post(`${this.REST_API_SERVER}/${url}`, data, options);

  public put = (url: string, data: any, options?: any): Observable<any> =>
    this.http.put(`${this.REST_API_SERVER}/${url}`, data, options);

  public patch = (url: string, data: any, options?: any): Observable<any> =>
    this.http.patch(`${this.REST_API_SERVER}/${url}`, data, options);

  public delete = (url: string, options?: any): Observable<any> =>
    this.http.delete(`${this.REST_API_SERVER}/${url}`, options);
}
