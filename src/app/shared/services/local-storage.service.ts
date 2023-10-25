import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LocalStoreService {
  private ls = window.localStorage;

  constructor() {}

  public setItem(key: string, value: any) {
    value = JSON.stringify(value);
    this.ls.setItem(key, value);
    return true;
  }

  public getItem(key: string) {
    const value = this.ls.getItem(key);
    try {
      if (value) {
        return JSON.parse(value);
      }
    } catch (e) {
      return null;
    }
  }

  public clear() {
    this.ls.clear();
  }

  public remove(key: string) {
    this.ls.removeItem(key);
    return;
  }
}
